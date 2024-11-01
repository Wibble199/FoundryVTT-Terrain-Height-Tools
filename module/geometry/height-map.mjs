/** @import { LineOfSightIntersectionRegion } from "./height-map-shape.mjs" */
/** @import { HeightMapDataV1, HeightMapDataV1Terrain } from "../utils/height-map-migrations.mjs" */
import { flags, moduleName } from "../consts.mjs";
import { distinctBy, groupBy } from '../utils/array-utils.mjs';
import { getGridCellPolygon } from "../utils/grid-utils.mjs";
import { DATA_VERSION, migrateData } from "../utils/height-map-migrations.mjs";
import { debug, error } from '../utils/log.mjs';
import { OrderedSet } from '../utils/misc-utils.mjs';
import { getTerrainTypeMap, getTerrainTypes } from '../utils/terrain-types.mjs';
import { HeightMapShape } from "./height-map-shape.mjs";
import { Polygon } from './polygon.mjs';

const maxHistoryItems = 10;

export class HeightMap {

	/** @type {HeightMapDataV1} */
	data;

	/** @type {Partial<HeightMapDataV1>[]} */
	_history = [];

	/** @type {HeightMapShape[]} */
	#shapes = [];

	/** @param {Scene} */
	constructor(scene) {
		/** @type {Scene} */
		this.scene = scene;
		this.reload();
	}

	/**
	 * The resulting complex shapes that make up the parts of the map.
	 * This property is calculated and the returned array should not be modified.
	 * @type {readonly HeightMapShape[]}
	 */
	get shapes() {
		return [...this.#shapes];
	}

	/**
	 * Reloads the data from the scene.
	 */
	reload() {
		const flagData = this.scene.getFlag(moduleName, flags.heightData);
		this.data = migrateData(flagData).data;
		this._recalculateShapes();
	}

	/**
	 * Gets the height data exists at the given position, or `undefined` if it does not exist.
	 * @param {number} row
	 * @param {number} col
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
		return this.#shapes.filter(s => s.containsCell(row, col));
	}

	// -------------- //
	// Painting tools //
	// -------------- //
	/**
	 * Attempts to paint multiple cells at the given position.
	 * @param {[number, number][]} cells A list of cells to paint.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @param {Object} [options]
	 * @param {boolean} [options.overwrite] Whether or not to overwrite already-painted cells with hew terrain data.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async paintCells(cells, terrainTypeId, height = 1, elevation = 0, { overwrite = true } = {}) {
		/** @type {this["_history"][number]} */
		const history = {};

		const terrainTypeMap = getTerrainTypeMap();
		const terrainType = terrainTypeMap.get(terrainTypeId);
		if (!terrainType)
			throw new Error(`Cannot paint cells with unknown terrain type '${terrainTypeId}'.`);
		if (terrainType.usesHeight && (typeof height !== "number" || height <= 0))
			throw new Error("`height` must be a positive, non-zero number.");
		if (terrainType.usesHeight && (typeof elevation !== "number" || elevation < 0))
			throw new Error("`elevation` must be a positive number or zero.");

		const noHeightTerrains = getTerrainTypes().filter(t => !t.usesHeight).map(t => t.id);

		for (const cell of cells) {
			const cellKey = encodeCellKey(...cell);
			const terrainsInCell = this.data[cellKey];

			// If nothing is in this cell, can simplify logic.
			if (!terrainsInCell?.length) {
				history[cellKey] = [];
				this.data[cellKey] = [{ terrainTypeId, height, elevation }];
				continue;
			}

			const originalTerrainInCell = terrainsInCell.map(t => ({ ...t })); // create an unmodified clone for history
			let anyChanges = false;

			// If overwrite is true, and the given terrain type uses height, then find any other terrain types (besides
			// the one being painted and ones that do not use height), and erase them in this range so they don't
			// overlap. E.G. if a type A terrain was at H3 E0, and the user painted a type B terrain at H2 E2, then we
			// want to clip the A terrain to H2 E0.
			if (overwrite && terrainType.usesHeight) {
				anyChanges = HeightMap._eraseTerrainDataBetween(terrainsInCell, elevation, elevation + height, { excludingTerrainTypeIds: [...noHeightTerrains, terrainTypeId] }) || anyChanges;
			}

			// For terrain that uses height, use the merge function to merge with existing terrain of the same type.
			// For no-height terrain, simply add it if it doesn't already exist.
			if (terrainType.usesHeight) {
				anyChanges = HeightMap._insertTerrainDataAndMerge(terrainsInCell, terrainTypeId, elevation, height) || anyChanges;
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
			this._recalculateShapes();
		}

		return history.length > 0;
	}

	/**
	 * Performs a fill from the given cell's location.
	 * @param {[number, number]} startCell The cell to start the filling from.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @param {number} height The elevation of the terrain to paint.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async fillCells(startCell, terrainTypeId, height, elevation = 0) {
		// If we're filling the same as what's already here, do nothing
		const { terrainTypeId: startTerrainTypeId, height: startHeight } = this.get(...startCell) ?? {};
		if (startTerrainTypeId === terrainTypeId && startHeight === height) return [];

		const cellsToPaint = this.#findFillCells(startCell);
		if (cellsToPaint.length === 0) return false;
		return this.paintCells(cellsToPaint, terrainTypeId, height, elevation);
	}

	/**
	 * Attempts to erase data from multiple cells at the given position.
	 * @param {[number, number][]} cells
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

		const noHeightTerrains = getTerrainTypes().filter(t => !t.usesHeight).map(t => t.id);

		for (const cell of cells) {
			const cellKey = encodeCellKey(...cell);
			const terrainsInCell = this.data[cellKey];

			if (!terrainsInCell) continue;

			const originalTerrainInCell = terrainsInCell.map(t => ({ ...t })); // create an unmodified clone for history

			// Remove terrain that has a height
			let anyChanges = HeightMap._eraseTerrainDataBetween(terrainsInCell, bottom, top, {
				excludingTerrainTypeIds: [...noHeightTerrains, ...(excludingTerrainTypeIds ?? [])],
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
			this._recalculateShapes();
		}

		return history.length > 0;
	}

	/**
	 * Performs an erasing fill operation from the given cell's location.
	 * @param {[number, number]} startCell The cell to start the filling from.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async eraseFillCells(startCell) {
		const cellsToErase = this.#findFillCells(startCell);
		if (cellsToErase.length === 0) return false;
		return this.eraseCells(cellsToErase);
	}

	async clear() {
		if (Object.keys(this.data).length === 0) return false;
		this.data = {};
		await this.#saveChanges();
		this.#shapes = [];
		return true;
	}

	/**
	 * Mutates the given terrain data in-place to remove all terrain within the given region.
	 * Do not use outside this class. Only non-private to allow testing.
	 * @param {HeightMapDataV1Terrain[]} data The data to alter.
	 * @param {number} rangeBottom The bottom of the range of terrain to remove.
	 * @param {number} rangeTop The top of the range of terrain to remove.
	 * @param {Object} [options]
	 * @param {string[]} [options.excludingTerrainTypeIds] An optional list of terrain type IDs to ignore.
	 * @param {string[]} [options.onlyTerrainTypeIds] An optional list of terrain type IDs to affect.
	 * @returns `true` if any changes were made, `false` if not.
	 */
	static _eraseTerrainDataBetween(data, rangeBottom, rangeTop, { excludingTerrainTypeIds, onlyTerrainTypeIds } = {}) {
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
				terrain.height -= (rangeTop - terrain.elevation);
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
	_recalculateShapes() {
		this.#shapes = [];

		// Gridless scenes not supported
		if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return;

		const t1 = performance.now();

		const dataByTerrainDetails = groupBy(
			Object.entries(this.data).flatMap(([cell, terrains]) => terrains.map(t => ({ cell, position: decodeCellKey(cell), ...t }))),
			x => `${x.terrainTypeId}|${x.height}|${x.elevation}`);

		for (const [, cells] of dataByTerrainDetails) {
			const { terrainTypeId, height, elevation } = cells[0];

			// For polygon calculation to work, we ensure the cells are sorted so that they process in clockwise order
			cells.sort(({ position: a }, { position: b }) => a[0] - b[0] || a[1] - b[1]);

			// Get the grid-sized polygons for each cell at this terrain type and height
			const polygons = cells.map(({ cell, position }) => ({ cell, poly: new Polygon(getGridCellPolygon(...position)) }));

			// Combine connected grid-sized polygons into larger polygons where possible
			this.#shapes.push(...HeightMap.#combinePolygons(polygons, terrainTypeId, height, elevation));
		}

		const t2 = performance.now();
		debug(`Shape calculation took ${t2 - t1}ms`);
	}

	/**
	 * Given a list of polygons, combines them together into as few polygons as possible.
	 * @param {{ poly: Polygon; cell: string; }[]} originalPolygons An array of polygons to merge. `cell` is the encoded
	 * cell key.
	 * @param {string} terrainTypeId The terrainTypeId value of the given polygons. Only used to populate the metadata.
	 * @param {number} height The height value of the given polygons. Only used to populate the metadata.
	 * @param {number} elevation The elevation value of the given polygons. Only used to populate the metadata.
	 * @returns {HeightMapShape[]}
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
		}

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
			.map(({ polygon, cells }) => new HeightMapShape({
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
					.offset({ y: game.canvas.grid.h * 0.05 });

				const intersectsWithEdges = containingPolygons.flatMap(shape => shape.polygon.edges
					.map(edge => ({
						intersectsAt: edge.intersectsYAt(testPoint.y),
						shape
					}))
					.filter(x => x.intersectsAt && x.intersectsAt < testPoint.x)
				);

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


	// ------------- //
	// Line of sight //
	// ------------- //
	/**
	 * Calculates the line of sight between the two given pixel coordinate points and heights.
	 * Returns an array of all shapes that were intersected, along with the regions where those shapes were intersected.
	 * @param {{ x: number; y: number; h: number; }} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {{ x: number; y: number; h: number; }} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {Object} [options={}] Options that change how the calculation is done.
	 * @param {boolean} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a
	 * height value will be included in the return list. They are treated as having infinite height.
	 * @returns {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]}
	 */
	calculateLineOfSight(p1, p2, { includeNoHeightTerrain = false } = {}) {
		const terrainTypes = getTerrainTypeMap();

		/** @type {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]} */
		const intersectionsByShape = [];

		for (const shape of this.#shapes) {
			// Ignore shapes of deleted terrain types
			if (!terrainTypes.has(shape.terrainTypeId)) continue;

			const { usesHeight } = terrainTypes.get(shape.terrainTypeId);

			// If this shape has a no-height terrain, only test for intersections if we are includeNoHeightTerrain
			if (!usesHeight && !includeNoHeightTerrain) continue;

			const regions = shape.getIntersections(p1, p2, usesHeight);
			if (regions.length > 0)
				intersectionsByShape.push({ shape, regions });
		}

		return intersectionsByShape;
	}

	/**
	 * Flattens an array of line of sight intersection regions into a single collection of regions.
	 * @param {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]} shapeRegions
	 * @returns {(LineOfSightIntersectionRegion & { terrainTypeId: string; height: number; })[]}
	 */
	static flattenLineOfSightIntersectionRegions(shapeRegions) {
		/** @type {(LineOfSightIntersectionRegion & { terrainTypeId: string; height: number; })[]} */
		const flatIntersections = [];

		// Find all points where a change happens - this may be entering, leaving or touching a shape.
		const boundaries = distinctBy(
				shapeRegions.flatMap(s => s.regions.flatMap(r => [r.start, r.end])),
				r => r.t
			).sort((a, b) => a.t - b.t);

		/** @type {{ x: number; y: number; h: number; t: number; }} */
		let lastPosition = undefined; // first boundary should always have 0 'active regions'

		for (const boundary of boundaries) {
			// Collect a list of intersection regions 'active' at this boundary.
			// An 'active' intersection is one that has been happening up until this particular point. Consider a map
			// as follows, where 1 and 2 are different shapes:
			// 1--22
			// 2222-
			// If a ray was drawn from (0,1) -> (3,1), the boundaries would be at x=0, x=1, x=3, x=4, x=5.
			// At boundary x=0, no regions would be 'active' as up until this point no intersections where happening.
			// At boundary x=1, two regions would be 'active', one from shape 1 and one from shape 2.
			// At boundary x=3, one region would be 'active', the skimming region against shape 2.
			// At boundary x=4, one region would be 'active', the shape entry into shape 2.
			// At boundary x=5, one region would be 'active', another skimming region against shape 2.
			const { t, h } = boundary;
			const activeRegions = shapeRegions
				.map(({ shape, regions }) => ({ shape, region: regions.find(r => r.start.t < t && r.end.t >= t) }))
				.filter(({ region }) => !!region);

			// If there is no active region, don't add an element to the intersections array, just move the position on.
			// There should only be 1 or 2 active regions. If there are two, that means that the ray 'skimmed' between
			// two adjacent shapes. In this case, this is an intersection, NOT a skim.
			if (activeRegions.length > 0) {
				// In the case of multiple, the resulting elevation is the lowest shape, and the height is the distance
				// from the lowest shape to the highest shape
				const elevation = Math.min.apply(null, activeRegions.map(r => r.shape.elevation));
				const height = Math.max.apply(null, activeRegions.map(r => r.shape.height + r.shape.elevation)) - elevation;

				flatIntersections.push({
					start: lastPosition,
					end: boundary,
					terrainTypeId: activeRegions[0].shape.terrainTypeId, // there's no good way to resolve this for multiple shapes, so just use whichever happens to be first
					height,
					elevation,
					skimmed: activeRegions.length === 1 && activeRegions[0].region.skimmed
				});
			}

			lastPosition = boundary;
		}

		return flatIntersections;
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
		const cleanedData = Object.fromEntries(Object.entries(this.data).filter(([, terrain]) => terrain?.length > 0));

		// Use update rather than SetFlag as we need to specify { diff: false, recursive: true } to prevent existing
		// empty cells from not being cleared.
		await this.scene.update({
			[`flags.${moduleName}.${flags.heightData}`]: {
				v: DATA_VERSION,
				data: cleanedData
			}
		}, {
			diff: false,
			recursive: false
		});
	}

	/**
	 * Calculates which cells would be affected if a fill operation started at the given startCell.
	 * @param {[number, number]} startCell The cell to start the filling from.
	 */
	#findFillCells(startCell) {
		const { terrainTypeId: startTerrainTypeId, height: startHeight, elevation: startElevation } = this.get(...startCell) ?? {};

		// From the starting cell, visit all neighboring cells around it.
		// If they have the same configuration (same terrain type and height), then fill it and queue it to have this
		// process repeated for that cell.

		const visitedCells = new Set();
		const visitQueue = [startCell];

		/** @type {[number, number][]} */
		const cellsToPaint = [];

		const { width: canvasWidth, height: canvasHeight } = game.canvas.dimensions;

		while (visitQueue.length > 0) {
			const [nextCell] = visitQueue.splice(0, 1);

			// Don't re-visit already visited ones
			const cellKey = encodeCellKey(...nextCell);
			if (visitedCells.has(cellKey)) continue;
			visitedCells.add(cellKey);

			// Check cell is the same config
			const { terrainTypeId: nextTerrainTypeId, height: nextHeight, elevation: nextElevation } = this.get(...nextCell) ?? {};
			if (nextTerrainTypeId !== startTerrainTypeId || nextHeight !== startHeight || nextElevation !== startElevation) continue;

			cellsToPaint.push(nextCell);

			// Enqueue neighbors
			for (const neighbor of this.#getNeighboringFillCells(...nextCell)) {

				// Get the position of the cell, ignoring it if it falls off the canvas
				const [x, y] = game.canvas.grid.grid.getPixelsFromGridPosition(...neighbor);
				if (x + game.canvas.grid.w < 0) continue; // left
				if (x >= canvasWidth) continue; // right
				if (y + game.canvas.grid.h < 0) continue; // top
				if (y >= canvasHeight) continue; // bottom

				visitQueue.push(neighbor);
			}
		}

		return cellsToPaint;
	}

	/** @returns {[number, number][]} */
	#getNeighboringFillCells(x, y) {
		// For hex grids, we can use the default implementation, but for square cells the default returns all 8 cells,
		// but for filling purposes we only want the 4 orthogonal.
		if (game.canvas.grid.isHex)
			return game.canvas.grid.grid.getNeighbors(x, y);

		return [
			[x, y - 1],
			[x - 1, y],
			[x + 1, y],
			[x, y + 1]
		];
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
 */
export function decodeCellKey(key) {
	const [row, col] = key.split("|");
	return [+row, +col];
}
