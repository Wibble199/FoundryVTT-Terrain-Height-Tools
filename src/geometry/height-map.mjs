/** @import { terrainPaintMode as TerrainPaintMode, terrainFillMode as TerrainFillMode } from "../consts.mjs" */
/** @import { HeightMapDataV1, HeightMapDataV1Terrain } from "../utils/height-map-migrations.mjs" */
import { flags, moduleName } from "../consts.mjs";
import { TerrainProvider } from "../stores/terrain-manager.mjs";
import { terrainTypeMap$, terrainTypes$ } from "../stores/terrain-types.mjs";
import { groupBy } from "../utils/array-utils.mjs";
import { getGridCellPolygon } from "../utils/grid-utils.mjs";
import { DATA_VERSION, migrateData } from "../utils/height-map-migrations.mjs";
import { debug, error } from "../utils/log.mjs";
import { OrderedSet } from "../utils/misc-utils.mjs";
import { Polygon } from "./polygon.mjs";
import { TerrainShape } from "./terrain-shape.mjs";

const maxHistoryItems = 10;

/**
 * Manages height map data for a scene, providing read/update functionality.
 */
export class HeightMap extends TerrainProvider {

	/** @type {HeightMapDataV1["data"]} */
	data;

	/** @type {Partial<HeightMapDataV1>[]} */
	_history = [];

	/** @param {Scene} */
	constructor(scene) {
		super();

		/** @type {Scene} */
		this.scene = scene;
		this.reload();
	}

	/**
	 * Reloads the data from the scene.
	 */
	reload() {
		const flagData = this.scene.getFlag(moduleName, flags.heightData);
		this.data = Object.fromEntries(migrateData(flagData).data ?? []);
		this.#recalculateShapes();
	}

	/**
	 * Gets the height data exists at the given position, or `undefined` if it does not exist.
	 * @param {number} row
	 * @param {number} col
	 * @returns {HeightMapDataV1Terrain[]}
	 */
	get(row, col) {
		return this.data[encodeCellKey(row, col)] ?? [];
	}

	/**
	 * Returns the shapes that exists at the given position.
	 * @param {number} row
	 * @param {number} col
	 */
	getShapes(row, col) {
		return [...this.terrainShapes$.value].filter(s => s.containsCell(row, col));
	}

	// -------------- //
	// Painting tools //
	// -------------- //
	/**
	 * Attempts to paint multiple cells at the given position.
	 * @param {[number, number][]} cells A list of cells to paint.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @param {number} elevation The elevation of the terrain to paint.
	 * @param {Object} [options]
	 * @param {TerrainPaintMode} [options.mode] How to handle existing terrain:
	 * - `"totalReplace"` - Completely overwrites all existing terrain data in the cells with the new data.
	 * - `"additiveMerge"` - Merges the new terrain data with the existing data, without removing any overlapping terrain.
	 * - `"destructiveMerge"` - Merges the new terrain data with the existing data, removing existing overlapping terrain.
	 */
	async paintCells(cells, terrainTypeId, height = 1, elevation = 0, { mode = "totalReplace" } = {}) {
		/** @type {this["_history"][number]} */
		const history = {};

		const terrainTypeMap = terrainTypeMap$.value;
		const terrainType = terrainTypeMap.get(terrainTypeId);
		if (!terrainType)
			throw new Error(`Cannot paint cells with unknown terrain type '${terrainTypeId}'.`);
		if (terrainType.usesHeight && (typeof height !== "number" || height <= 0))
			throw new Error("`height` must be a positive, non-zero number.");
		if (terrainType.usesHeight && (typeof elevation !== "number" || elevation < 0))
			throw new Error("`elevation` must be a positive number or zero.");

		const noHeightTerrains = terrainTypes$.value.filter(t => !t.usesHeight).map(t => t.id);

		for (const cell of cells) {
			const cellKey = encodeCellKey(...cell);
			const terrainsInCell = this.data[cellKey];

			// If nothing is in this cell, can simplify logic.
			if (!terrainsInCell?.length || mode === "totalReplace") {
				history[cellKey] = terrainsInCell ?? [];
				this.data[cellKey] = [{ terrainTypeId, height, elevation }];
				continue;
			}

			const originalTerrainInCell = terrainsInCell.map(t => ({ ...t })); // create an unmodified clone for history
			let anyChanges = false;

			// If the given terrain type uses height and we are to replace existing overlapping terrain, then find any
			// other terrain types (besides the one being painted and ones that do not use height), and erase them in
			// this range so they don't overlap. E.G. if a type A terrain was at H3 E0, and the user painted a type B
			// terrain at H2 E2, then we want to clip the A terrain to H2 E0. Then use the merge function to merge with
			// existing terrain of the same type.
			if (terrainType.usesHeight && mode === "destructiveMerge") {
				anyChanges = HeightMap._eraseTerrainDataBetween(terrainsInCell, elevation, elevation + height, { excludingTerrainTypeIds: [...noHeightTerrains, terrainTypeId] }) || anyChanges;
				anyChanges = HeightMap._insertTerrainDataAndMerge(terrainsInCell, terrainTypeId, elevation, height) || anyChanges;

			// For cases where we are not to replace existing overlapping terrain, then create a temporary terrain data
			// for the newly painted terrain and use the eraseTerrainDataBetween for each existing terrain (excluding
			// the same type being painted and ones that do not use height). Then, merge the result with the current
			// terrain.
			} else if (terrainType.usesHeight && mode === "additiveMerge") {
				/** @type {HeightMapDataV1Terrain[]} */
				const newTerrain = [{ terrainTypeId, height, elevation }];

				for (const existing of terrainsInCell)
					if (existing.terrainTypeId !== terrainTypeId && !noHeightTerrains.includes(existing.terrainTypeId))
						HeightMap._eraseTerrainDataBetween(newTerrain, existing.elevation, existing.elevation + existing.height);

				for (const { elevation, height } of newTerrain)
					anyChanges = HeightMap._insertTerrainDataAndMerge(terrainsInCell, terrainTypeId, elevation, height) || anyChanges;

			// For no-height terrain, simply add it if it doesn't already exist.
			} else {
				const exists = terrainsInCell.some(t => t.terrainTypeId === terrainTypeId);
				if (!exists) {
					terrainsInCell.push({ terrainTypeId, height, elevation });
					anyChanges = true;
				}
			}

			// If changes were made, add to the history
			if (anyChanges) {
				history[cellKey] = originalTerrainInCell;
			}
		}

		if (Object.keys(history).length > 0) {
			this.#pushHistory(history);
			await this.#saveChanges();
			this.#recalculateShapes();
		}

		return history.length > 0;
	}

	/**
	 * Attempts to paint multiple connected similar cells with the given terrain.
	 * @param {[number, number]} originCell The cell to begin the fill operation from.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @param {number} elevation The elevation of the terrain to paint.
	 * @param {Object} [options]
	 * @param {TerrainFillMode} [options.mode] How to handle connected cells:
	 * - `"applicableBoundary"` - Only fills cells that are have identical terrain data within the height range to be painted.
	 * - `"strictBoundary"` - Only fills cells that contain identical terrain data (looks at the entire cell).
	 */
	async fillCells(originCell, terrainTypeId, height = 1, elevation = 0, { mode = "applicableBoundary" } = {}) {
		const terrainTypeMap = terrainTypeMap$.value;
		const terrainType = terrainTypeMap.get(terrainTypeId);
		if (!terrainType)
			throw new Error(`Cannot paint cells with unknown terrain type '${terrainTypeId}'.`);
		if (terrainType.usesHeight && (typeof height !== "number" || height <= 0))
			throw new Error("`height` must be a positive, non-zero number.");
		if (terrainType.usesHeight && (typeof elevation !== "number" || elevation < 0))
			throw new Error("`elevation` must be a positive number or zero.");

		/** @type {Set<string>} */
		const visitedCells = new Set();
		const toVisitQueue = [originCell];
		const initialTerrainData = this.get(...originCell).map(t => ({ ...t }));

		/** @type {this["_history"][number]} */
		const history = {};

		while (toVisitQueue.length > 0) {
			const [x, y] = toVisitQueue.shift();

			// Don't re-visit already visited cells
			const cellKey = encodeCellKey(x, y);
			if (visitedCells.has(cellKey)) continue;
			visitedCells.add(cellKey);

			const terrainData = this.data[cellKey] ?? [];

			switch (mode) {
				case "applicableBoundary":
				case "strictBoundary": {
					// In applicableBoundary we look for a match in the range of the paint - except for zones which behave as strict
					// In strictBoundary mode we look for an exact match between terrains
					const isTerrainEqual = mode === "applicableBoundary" && terrainType.usesHeight
						? HeightMap.#terrainEqualInRange(initialTerrainData, terrainData, elevation, elevation + height)
						: HeightMap.#terrainEqual(initialTerrainData, terrainData);
					if (!isTerrainEqual) continue;

					history[cellKey] = terrainData.map(t => ({ ...t })); // create an unmodified clone for history

					if (terrainType.usesHeight)
						HeightMap._eraseTerrainDataBetween(terrainData, elevation, elevation + height);
					HeightMap._insertTerrainDataAndMerge(terrainData, terrainTypeId, elevation, height);
					this.data[cellKey] = terrainData;

					toVisitQueue.push(...this.#getNeighbouringCells(x, y));
					break;
				}

				// TODO: implement "flood" - which would behave similar to a liquid that can 'flow' through gaps?

				default:
					throw new Error(`Unknown fill mode "${mode}"`);
			}
		}

		this.#pushHistory(history);
		await this.#saveChanges();
		this.#recalculateShapes();
	}

	/**
	 * Attempts to erase data from multiple cells at the given position.
	 * @param {Iterable<[number, number] | string>} cells The locations of the cells to erase. Either [row, col] pairs
	 * or encoded cell keys.
	 * @param {Object} [options]
	 * @param {string[]} [options.onlyTerrainTypeIds] A list of terrain type IDs to remove.
	 * @param {string[]} [options.excludingTerrainTypeIds] A list of terrain type IDs NOT to remove.
	 * @param {number} [options.bottom] The optional lower range to remove terrain from. Does not apply to no-height terrain.
	 * @param {number} [options.top] Optional upper range to remove terrain from. Does not apply to no-height terrain.
	 * @returns `true` if the map was updated and needs to be re-drawn, false otherwise.
	 */
	async eraseCells(cells, { onlyTerrainTypeIds, excludingTerrainTypeIds, bottom = -Infinity, top = Infinity } = {}) {
		/** @type {this["_history"][number]} */
		const history = {};

		const noHeightTerrains = terrainTypes$.value.filter(t => !t.usesHeight).map(t => t.id);

		for (const cell of cells) {
			const cellKey = typeof cell === "string" ? cell : encodeCellKey(...cell);
			const terrainsInCell = this.data[cellKey];

			if (!terrainsInCell) continue;

			const originalTerrainInCell = terrainsInCell.map(t => ({ ...t })); // create an unmodified clone for history

			// Remove terrain that has a height
			let anyChanges = HeightMap._eraseTerrainDataBetween(terrainsInCell, bottom, top, {
				excludingTerrainTypeIds: [...noHeightTerrains, ...excludingTerrainTypeIds ?? []],
				onlyTerrainTypeIds: onlyTerrainTypeIds
			});

			// Remove no-height terrain
			for (let i = terrainsInCell.length - 1; i >= 0; i--) {
				const { terrainTypeId } = terrainsInCell[i];
				if (noHeightTerrains.includes(terrainTypeId) && onlyTerrainTypeIds?.includes(terrainTypeId) !== false && excludingTerrainTypeIds?.includes(terrainTypeId) !== true) {
					terrainsInCell.splice(i, 1);
					anyChanges = true;
				}
			}

			// If changes were made, add to the history
			if (anyChanges) {
				history[cellKey] = originalTerrainInCell;
			}
		}

		if (Object.keys(history).length > 0) {
			this.#pushHistory(history);
			await this.#saveChanges();
			this.#recalculateShapes();
		}

		return history.length > 0;
	}

	/**
	 * Remove the given TerrainShape from the height map.
	 * @param {TerrainShape} shape Shape to remove.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async eraseShape(shape) {
		return await this.eraseCells(shape.cells, {
			onlyTerrainTypeIds: [shape.terrainTypeId],
			bottom: shape.elevation,
			top: shape.elevation + shape.height
		});
	}

	async clear() {
		if (Object.keys(this.data).length === 0) return false;
		this.data = {};
		await this.#saveChanges();
		this.deleteAllShapes();
		return true;
	}

	/**
	 * Mutates the given terrain data in-place to remove all terrain within the given region.
	 * Do not use outside this class. Only non-private to allow testing.
	 * @param {HeightMapDataV1Terrain[]} data The data to alter.
	 * @param {number | null} [rangeBottom] The bottom of the range of terrain to remove.
	 * @param {number | null} [rangeTop] The top of the range of terrain to remove.
	 * @param {Object} [options]
	 * @param {string[]} [options.excludingTerrainTypeIds] An optional list of terrain type IDs to ignore.
	 * @param {string[]} [options.onlyTerrainTypeIds] An optional list of terrain type IDs to affect.
	 * @returns `true` if any changes were made, `false` if not.
	 */
	static _eraseTerrainDataBetween(data, rangeBottom, rangeTop, { excludingTerrainTypeIds, onlyTerrainTypeIds } = {}) {
		rangeBottom ??= -Infinity;
		rangeTop ??= Infinity;

		let anyChanges = false;

		for (let i = data.length - 1; i >= 0; i--) {
			const terrain = data[i];

			if (excludingTerrainTypeIds?.includes(terrain.terrainTypeId) === true || onlyTerrainTypeIds?.includes(terrain.terrainTypeId) === false)
				continue;

			const terrainTop = terrain.elevation + terrain.height;

			// If the terrain that already exists is completely within the erasure range, remove it
			if (terrain.elevation >= rangeBottom && terrainTop <= rangeTop) {
				data.splice(i, 1);
				anyChanges = true;
			}

			// If the terrain that already exists completely contains the erasure range, split it in two
			else if (rangeBottom > terrain.elevation && rangeTop < terrainTop) {
				/** @type {HeightMapDataV1Terrain} */
				const splitTerrainPart = { // create new upper part
					elevation: rangeTop,
					height: terrainTop - rangeTop,
					terrainTypeId: terrain.terrainTypeId
				};

				terrain.height = rangeBottom - terrain.elevation; // convert existing to lower part

				data.splice(i + 1, 0, splitTerrainPart); // insert new part

				anyChanges = true;
			}

			// If the bottom of the existing terrain overlaps the top of the erasure range
			else if (terrain.elevation < rangeTop && terrainTop > rangeTop) {
				terrain.height -= rangeTop - terrain.elevation;
				terrain.elevation = rangeTop;
				anyChanges = true;
			}

			// If the top of the existing terrain overlaps the bottom of the erasure range
			else if (rangeBottom < terrainTop && rangeBottom > terrain.elevation) {
				terrain.height -= terrainTop - rangeBottom;
				anyChanges = true;
			}
		}

		return anyChanges;
	}

	/**
	 * Mutates the given terriain data in-place to insert new terrain of the given ID in the given range, merging it
	 * adjacent and overlapping existing terrain of the same type.
	 * Do not use outside this class. Only non-private to allow testing.
	 * @param {HeightMapDataV1Terrain[]} data The data to alter.
	 * @param {string} terrainTypeId
	 * @param {number} elevation
	 * @param {number} height
	 * @returns `true` if any changes were made, `false` if not.
	 */
	static _insertTerrainDataAndMerge(data, terrainTypeId, elevation, height) {
		const top = elevation + height;

		/** @type {HeightMapDataV1Terrain[]} */
		const mergeTerrains = [];

		for (let i = data.length - 1; i >= 0; i--) {
			const existingTerrain = data[i];

			if (existingTerrain.terrainTypeId !== terrainTypeId)
				continue;

			const existingTop = existingTerrain.elevation + existingTerrain.height;

			// If this existing terrain already entirely covers what we're painting, nothing needs to be done. Return
			// false as no changes have been made.
			if (existingTerrain.elevation <= elevation && existingTop >= top)
				return false;

			if (
				(existingTerrain.elevation >= elevation && existingTerrain.elevation <= top) ||
				(existingTop >= elevation && existingTop <= top)
			) {
				mergeTerrains.push(existingTerrain);
				data.splice(i, 1);
			}
		}

		// Work out the top and bottom (elevation) points of the resulting merged terrain
		const topMerged = Math.max(top, ...mergeTerrains.map(t => t.elevation + t.height));
		const elevationMerged = Math.min(elevation, ...mergeTerrains.map(t => t.elevation));

		// Use those values to work out the elevation and height of the merged block
		data.push({ terrainTypeId, elevation: elevationMerged, height: topMerged - elevationMerged });
		return true;
	}


	// -------- //
	// Geometry //
	// -------- //
	#recalculateShapes() {
		this.deleteAllShapes();

		// Gridless scenes not supported
		if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
			return;
		}

		const t1 = performance.now();

		const dataByTerrainDetails = groupBy(
			Object.entries(this.data).flatMap(([cell, terrains]) => terrains.map(t => ({ cell, position: decodeCellKey(cell), ...t }))),
			x => `${x.terrainTypeId}|${x.height}|${x.elevation}`
		);

		const shapes = [];
		for (const [, cells] of dataByTerrainDetails) {
			const { terrainTypeId, height, elevation } = cells[0];

			// For polygon calculation to work, we ensure the cells are sorted so that they process in clockwise order
			cells.sort(({ position: a }, { position: b }) => a[0] - b[0] || a[1] - b[1]);

			// Get the grid-sized polygons for each cell at this terrain type and height
			const polygons = cells.map(({ cell, position }) => ({ cell, poly: new Polygon(getGridCellPolygon(...position)) }));

			// Combine connected grid-sized polygons into larger polygons where possible
			shapes.push(...HeightMap.#combinePolygons(polygons, terrainTypeId, height, elevation));
		}

		const t2 = performance.now();
		debug(`Shape calculation took ${t2 - t1}ms`);

		this.addShapes(...shapes);
	}

	/**
	 * Given a list of polygons, combines them together into as few polygons as possible.
	 * @param {{ poly: Polygon; cell: string; }[]} originalPolygons An array of polygons to merge. `cell` is the encoded
	 * cell key.
	 * @param {string} terrainTypeId The terrainTypeId value of the given polygons. Only used to populate the metadata.
	 * @param {number} height The height value of the given polygons. Only used to populate the metadata.
	 * @param {number} elevation The elevation value of the given polygons. Only used to populate the metadata.
	 * @returns {TerrainShape[]}
	 */
	static #combinePolygons(originalPolygons, terrainTypeId, height, elevation) {

		// Generate a graph of all edges in all the polygons
		const allEdges = originalPolygons.flatMap(({ poly, cell }) =>
			poly.edges.map(edge => ({ edge, cell })));

		// Maintain a record of which cells are adjacent (caused by pairs of edges destructing)
		/** @type {Map<string, Set<string>>} */
		const connectedCells = new Map();

		const connectCell = (c1, c2) => {
			const set = connectedCells.get(c1);
			if (set) set.add(c2);
			else connectedCells.set(c1, new Set([c2]));
		};

		// Remove any duplicate edges
		for (let i = 0; i < allEdges.length; i++) {
			for (let j = i + 1; j < allEdges.length; j++) {
				if (allEdges[i].edge.equals(allEdges[j].edge)) {
					connectCell(allEdges[j].cell, allEdges[i].cell);
					connectCell(allEdges[i].cell, allEdges[j].cell);
					allEdges.splice(j, 1);
					allEdges.splice(i, 1);
					i--;
					break;
				}
			}
		}

		// From some start edge, keep finding the next edge that joins it until we are back at the start.
		// If there are multiple edges starting at a edge's endpoint (e.g. two squares touch by a corner), then
		// use the one that most clockwise.
		/** @type {{ polygon: Polygon; cells: Set<string>; }[]} */
		const combinedPolygons = [];
		while (allEdges.length) {
			// Find the next unvisited edge, and follow the edges until we join back up with the first
			const edges = allEdges.splice(0, 1);
			while (!edges[0].edge.p1.equals(edges[edges.length - 1].edge.p2)) {
				// To find the next edge, we find edges that start where the last edge ends.
				// For hex grids (where a max of 3 edges can meet), there will only ever be 1 other edge here (as if
				// there were 4 edges, 2 would've overlapped and been removed) so we can just use that edge.
				// But for square grids, there may be two edges that start here. In that case, we want to find the one
				// that is next when rotating counter-clockwise.
				const nextEdgeCandidates = allEdges
					.map(({ edge }, idx) => ({ edge, idx }))
					.filter(({ edge }) => edge.p1.equals(edges[edges.length - 1].edge.p2));

				if (nextEdgeCandidates.length === 0)
					throw new Error("Invalid graph detected. Missing edge.");

				const nextEdgeIndex = nextEdgeCandidates.length === 1
					? nextEdgeCandidates[0].idx
					: nextEdgeCandidates
						.map(({ edge, idx }) => ({ angle: edges[edges.length - 1].edge.angleBetween(edge), idx }))
						.sort((a, b) => a.angle - b.angle)[0].idx;

				const [nextEdge] = allEdges.splice(nextEdgeIndex, 1);
				edges.push(nextEdge);
			}

			// Work out which cells are part of this polygon
			// We initialise this set with the known cells - but these will only be cells that have at least one edge
			// that has not been destructed - e.g. in a hex with 2 polygons per side, the central hex would not be in
			// this list.
			// We then visit all the cells in this Set, and check to see if they are in the destruction map. If so, add
			// the cells from inner set to this set. Keep doing that until we've visited all cells (inc. newly added).
			const polygonCells = new OrderedSet(edges.map(({ cell }) => cell));
			for (const cell of polygonCells)
				polygonCells.addRange(connectedCells.get(cell));

			// Add completed polygon to the list
			combinedPolygons.push({
				polygon: new Polygon(edges.map(({ edge }) => edge.p1)),
				cells: new Set(polygonCells)
			});
		}

		// To determine if a polygon is a "hole" we need to check whether it is inside another polygon.
		// Since the polygon vertices are always the same direction, we can use to determine whether it is a hole: if
		// the points are going clockwise, then it IS NOT a hole, but if they are anti-clockwise then it IS a hole.
		// For each hole, we need to find which polygon it is a hole in, as the hole must be drawn immediately after.
		// To find the hole's parent, we search back up the sorted list of polygons in reverse for the first one that
		// contains it.
		/** @type {Map<boolean, typeof combinedPolygons>} */
		const polysAreHolesMap = groupBy(combinedPolygons, ({ polygon }) => !polygon.edges[0].clockwise);

		const solidPolygons = (polysAreHolesMap.get(false) ?? [])
			.map(({ polygon, cells }) => new TerrainShape({
				polygon,
				holes: [],
				terrainTypeId,
				height,
				elevation,
				cells
			}));

		const holePolygons = polysAreHolesMap.get(true) ?? [];

		// For each hole, we need to check which non-hole poly it is inside. We gather a list of non-hole polygons that
		// contains it. If there is only one, we have found which poly it is a hole of. If there are more, we imagine a
		// horizontal line drawn from the topmost point of the inner polygon (with a little Y offset added so that we
		// don't have to worry about vertex collisions) to the left and find the first polygon that it intersects.
		for (const { polygon: holePolygon } of holePolygons) {
			const containingPolygons = solidPolygons.filter(p => p.polygon.containsPolygon(holePolygon));

			if (containingPolygons.length === 0) {
				error("Something went wrong calculating which polygon this hole belonged to: No containing polygons found.", { holePolygon, solidPolygons });
				throw new Error("Could not find a parent polygon for this hole.");

			} else if (containingPolygons.length === 1) {
				containingPolygons[0].holes.push(holePolygon);

			} else {
				const testPoint = holePolygon.vertices
					.find(p => p.y === holePolygon.boundingBox.y1)
					.offset({ y: canvas.grid.sizeY * 0.05 });

				const intersectsWithEdges = containingPolygons.flatMap(shape => shape.polygon.edges
					.map(edge => ({
						intersectsAt: edge.intersectsYAt(testPoint.y),
						shape
					}))
					.filter(x => x.intersectsAt && x.intersectsAt < testPoint.x));

				if (intersectsWithEdges.length === 0) {
					error("Something went wrong calculating which polygon this hole belonged to: No edges intersected horizontal ray.", { holePolygon, solidPolygons });
					throw new Error("Could not find a parent polygon for this hole.");
				}

				intersectsWithEdges.sort((a, b) => b.intersectsAt - a.intersectsAt);
				intersectsWithEdges[0].shape.holes.push(holePolygon);
			}
		}

		return solidPolygons;
	}


	// ------- //
	// History //
	// ------- //
	/**
	 * Pushes new history data onto the stack.
	 * @param {this["_history"][number]} historyEntry
	 */
	#pushHistory(historyEntry) {
		this._history.push(historyEntry);

		// Limit the number of changes we store in the history, removing old entries first
		while (this._history.length > maxHistoryItems)
			this._history.shift();
	}

	/**
	 * Undoes the most-recent change made to the height map.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async undo() {
		if (this._history.length <= 0) return false;

		const revertChanges = this._history.pop();

		for (const [position, state] of Object.entries(revertChanges)) {
			if (state?.length === 0)
				delete this.data[position];
			else
				this.data[position] = state;
		}

		this.#saveChanges();
		return true;
	}


	// ----- //
	// Utils //
	// ----- //
	async #saveChanges() {
		// Remove empty cells
		const cleanedData = Object.entries(this.data).filter(([, terrain]) => terrain?.length > 0);

		await this.scene.setFlag(moduleName, flags.heightData, { v: DATA_VERSION, data: cleanedData });
	}

	/**
	 * Determines if two terrains are equal.
	 * @param {HeightMapDataV1Terrain[]} a
	 * @param {HeightMapDataV1Terrain[]} b
	 */
	static #terrainEqual(a, b) {
		if (a.length !== b.length)
			return false;

		b = [...b]; // clone B so we can remove items from it without effecting the original

		outer: for (const t1 of a) {
			for (let i = 0; i < b.length; i++) {
				const t2 = b[i];

				if (
					t1.terrainTypeId === t2.terrainTypeId &&
					t1.height === t2.height &&
					t1.elevation === t2.elevation
				) {
					b.splice(i, 1);
					continue outer;
				}
			}

			return false;
		}

		return b.length === 0;
	}

	/**
	 * Determines if two terrains are equal within the given height range.
	 * @param {HeightMapDataV1Terrain[]} a
	 * @param {HeightMapDataV1Terrain[]} b
	 * @param {number} bottom
	 * @param {number} top
	 */
	static #terrainEqualInRange(a, b, bottom, top) {
		return HeightMap.#terrainEqual(
			HeightMap.#terrainSlice(a, bottom, top),
			HeightMap.#terrainSlice(b, bottom, top)
		);
	}

	/**
	 * Takes terrain data, and returns just the slice of that exists within the given range.
	 * @param {HeightMapDataV1Terrain[]} terrain
	 * @param {number} bottom
	 * @param {number} top
	 * @returns {HeightMapDataV1Terrain[]}
	 */
	static #terrainSlice(terrain, bottom, top) {
		return terrain
			.filter(r => r.elevation < top && r.elevation + r.height > bottom)
			.map(r => ({
				...r,
				elevation: Math.max(r.elevation, bottom),
				height: Math.min(r.height, top - r.elevation)
			}));
	}

	/**
	 * Returns the cells that neighbour the given cell.
	 * @param {number} x
	 * @param {number} y
	 */
	#getNeighbouringCells(x, y) {
		/** @type {{ i: number, j: number }[]} */
		const neighbours = canvas.grid.isHexagonal
			// For hex grids use the provided getAdjacentOffsets method.
			? canvas.grid.getAdjacentOffsets({ i: x, j: y })

			// For square grids, this method returns all 8 cells, but we only want the 4 orthogonal cells.
			: [
				{ i: x, j: y - 1 },
				{ i: x - 1, j: y },
				{ i: x + 1, j: y },
				{ i: x, j: y + 1 }
			];

		// Filter out cells that fall outside the canvas
		const { width: maxX, height: maxY } = canvas.dimensions;
		const { sizeX, sizeY } = canvas.grid;
		return neighbours
			.filter(c => {
				const { x, y } = canvas.grid.getTopLeftPoint(c);
				return x + sizeX > 0 // left
					&& x < maxX // right
					&& y + sizeY > 0 // top
					&& y < maxY; // bottom
			})
			.map(c => [c.i, c.j]);
	}
}

/**
 * Converts a row and column coordinate into a key for objects/maps/sets/etc.
 * @param {number} row
 * @param {number} col
 */
export function encodeCellKey(row, col) {
	return `${row}|${col}`;
}

/**
 * Converts a cell string key used for a map/set ("row.col") back into coordinate pairs.
 * @param {string} key
 * @returns {[number, number]}
 */
export function decodeCellKey(key) {
	const [row, col] = key.split("|");
	return [+row, +col];
}
