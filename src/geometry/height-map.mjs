/** @import { terrainPaintMode as TerrainPaintMode, terrainFillMode as TerrainFillMode } from "../consts.mjs" */
/** @import { HeightMapDataV3 } from "../utils/height-map-migrations.mjs" */
import { flags, moduleName } from "../consts.mjs";
import { TerrainProvider } from "../stores/terrain-manager.mjs";
import { getTerrainType, terrainTypes$ } from "../stores/terrain-types.mjs";
import { groupBy2 } from "../utils/array-utils.mjs";
import { polygonsFromGridCells } from "../utils/grid-utils.mjs";
import { DATA_VERSION, migrateData } from "../utils/height-map-migrations.mjs";
import { debug } from "../utils/log.mjs";
import { Polygon } from "./polygon.mjs";
import { TerrainShape } from "./terrain-shape.mjs";

const { ctDifference, ctIntersection, ctUnion } = ClipperLib.ClipType;
const { ptClip, ptSubject } = ClipperLib.PolyType;
const { pftPositive } = ClipperLib.PolyFillType;

const maxHistoryItems = 10;

/**
 * Manages height map data for a scene, providing read/update functionality.
 */
export class HeightMap extends TerrainProvider {

	/** @type {HeightMapDataV3["data"]} */
	#data;

	_canvasReady() {
		this._reloadData();
	}

	/** @override */
	_updateScene(delta) {
		// If the current scene's height data has changed, reload the map
		if (delta.flags?.[moduleName]?.[flags.heightData])
			this._reloadData();

		super._updateScene(delta);
	}

	/**
	 * Reloads the data from the scene.
	 */
	_reloadData() {
		const sceneFlagData = canvas.scene.getFlag(moduleName, flags.heightData);
		this.#data = migrateData(sceneFlagData, canvas.grid).data;

		this.setShapes(...this.#data.shapes.map(shape => new TerrainShape(shape)));
	}

	/**
	 * Gets the height data exists at the given position, or `undefined` if it does not exist.
	 * @param {number} row
	 * @param {number} col
	 */
	get(row, col) {
		return this.getShapesAtPoint(0, 0); // TODO: is this needed?
	}

	/**
	 * Returns the shapes that exist at the given x and y coordinates.
	 * @param {number} x
	 * @param {number} y
	 * @returns {TerrainShape[]}
	 */
	getShapesAtPoint(x, y) {
		return [...this.getShapes(new PIXI.Rectangle(x, y, 0, 0), {
			collisionTest: ({ t: shape }) => shape.containsPoint(x, y, { containsOnEdge: true })
		})];
	}

	// -------------- //
	// Painting tools //
	// -------------- //
	/**
	 * Paints a region onto the heightmap, creating a new shape or combining existing shapes where relevant.
	 * @param {{ polygon: ({ x: number; y: number; } | { X: number; Y: number; })[]; holes?: ({ x: number; y: number; } | { X: number; Y: number; })[][]; }} region
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @param {number} elevation The elevation of the terrain to paint.
	 * @param {Object} [options]
	 * @param {TerrainPaintMode} [options.mode] How to handle existing terrain:
	 * - `"totalReplace"` - Completely overwrites all existing terrain data in the cells with the new data.
	 * - `"additiveMerge"` - Merges the new terrain data with the existing data, without removing any overlapping terrain.
	 * - `"destructiveMerge"` - Merges the new terrain data with the existing data, removing existing overlapping terrain.
	 */
	async paintRegion({ polygon, holes = [] }, terrainTypeId, height = 0, elevation = 0, { mode = "totalReplace" } = {}) {
		const terrainType = getTerrainType(terrainTypeId);
		if (!terrainType) throw new Error(`Invalid terrain type ID '${terrainTypeId}'`);

		const startTimestamp = performance.now();

		const top = elevation + height;
		const bottom = elevation;

		const outerPolygon = Polygon.createSolid(polygon);
		const holePolygons = holes.map(h => Polygon.createHole(h));

		// This arrays will be the result of the Clipper operations for the newly created shapes and their values
		let newShapePaths = [
			{
				top,
				bottom,
				paths: [
					// Create clipper path from the polygons to ensure the vertices are defined in the correct order
					outerPolygon.getClipperPath(),
					...holePolygons.map(h => h.getClipperPath())
				]
			}
		];

		const clipper = new ClipperLib.Clipper();
		clipper.StrictlySimple = true;

		// STAGE 1: Update the new or existing shapes according to vertical overlaps.
		switch (true) {
			// If doing total replace, just clip any existing shapes in the polygon area
			case mode === "totalReplace": {
				await this.eraseRegion({ polygon, holes }, { history: false });
				break;
			}

			// If doing a destructive merge of a non-zone, remove other non-zones in the polygon area and height range
			case mode === "destructiveMerge" && terrainType.usesHeight: {
				const nonZoneTerrainTypeIds = terrainTypes$.value.filter(t => t.usesHeight).map(t => t.id);
				await this.eraseRegion({ polygon, holes }, { onlyTerrainTypeIds: nonZoneTerrainTypeIds, top, bottom, history: false });
				break;
			}

			// If doing a destructive merge of a zone, remove other zones in the polygon area
			case mode === "destructiveMerge" && !terrainType.usesHeight: {
				const zoneTerrainTypeIds = terrainTypes$.value.filter(t => !t.usesHeight).map(t => t.id);
				await this.eraseRegion({ polygon, holes }, { onlyTerrainTypeIds: zoneTerrainTypeIds, history: false });
				break;
			}

			// If doing an additive merge of a non-zone, need to modify the newShapePaths to carve out areas that are
			// overlapping existing terrain.
			case mode === "additiveMerge" && terrainType.usesHeight: {
				// We don't care about the terrain types of the existing terrain, so just combine the clipper paths of
				// shapes with identical top/bottom values.
				/** @type {Map<string, { top: number; bottom: number; paths: ClipperLib.IntPoint[][] }>} */
				const existingShapePaths = groupBy2(
					this.getShapes(outerPolygon.boundingRect, {
						collisionTest: ({ t: shape }) => shape.usesHeight && shape.top > bottom && shape.bottom < top
					}),
					shape => `${shape.top}|${shape.bottom}`,
					shapes => ({ top: shapes[0].top, bottom: shapes[0].bottom, paths: shapes.flatMap(shape => shape.getClipperPath()) })
				);

				for (const [, existingShape] of existingShapePaths) {
					// Put the changes into a new array, then replace the entire existing array with the new one.
					// I.E. this is so we do NOT modify the array as we're iterating over it too.
					// Also, naming things is hard :(
					/** @type {typeof newShapePaths} */
					const newNewShapePaths = [];

					const addNewNewShapePath = (paths, top, bottom) => {
						const existing = newNewShapePaths.find(p => p.top === top && p.bottom === bottom);
						if (existing)
							existing.paths.push(...paths);
						else
							newNewShapePaths.push({ paths: Array.from(paths), top, bottom });
					};

					for (const newShapePath of newShapePaths) {
						clipper.AddPaths(newShapePath.paths, ptSubject, true);
						clipper.AddPaths(existingShape.paths, ptClip, true);

						// Work out the intersection between the new shape and the existing shape. If the new shape
						// could fit above or below the existing shape, add those height/elevation ranges to the paths.
						const intersection = [];
						clipper.Execute(ctIntersection, intersection, pftPositive, pftPositive);

						if (newShapePath.bottom < existingShape.bottom)
							addNewNewShapePath(intersection, existingShape.bottom, newShapePath.bottom);

						if (newShapePath.top > existingShape.top)
							addNewNewShapePath(intersection, newShapePath.top, existingShape.top);

						// Work out the difference - i.e. the part of the new shape untouched by the existing shape, and
						// add it to the paths at the full height (i.e. this bit hasn't been carved out).
						const newShapePathOnly = [];
						clipper.Execute(ctDifference, newShapePathOnly, pftPositive, pftPositive);

						addNewNewShapePath(newShapePathOnly, newShapePath.top, newShapePath.bottom);

						// Reset Clipper for next iteration
						clipper.Clear();
					}

					newShapePaths = newNewShapePaths;
				}

				break;
			}

			// If doing an additive merge of a zone, don't need to do anything here, just the merge in stage 2 :)
		}

		// STAGE 2: Merge the new terrain with any adjacent existing terrain of the same type, top, & bottom and add to
		// the scene
		for (let { top, bottom, paths } of newShapePaths) {
			// Figure out if any similar shapes are adjacent, as these might be able to be merged
			const possibleMergeCandidates = new Set(HeightMap.#shapesFromClipperResult(paths)
				.flatMap(({ polygon }) => [...this.getShapes(
					// Increase the size by 1px on each side so we can get shapes which touch but don't overlap
					new PIXI.Rectangle(
						polygon.boundingBox.x1 - 1,
						polygon.boundingBox.y1 - 1,
						polygon.boundingBox.w + 2,
						polygon.boundingBox.h + 2
					),
					{
						collisionTest: ({ t: shape }) =>
							shape.terrainTypeId === terrainTypeId && shape.top === top && shape.bottom === bottom
					}
				)]));

			// If there were some potentially mergable shapes, merge (union) them
			if (possibleMergeCandidates.size > 0) {
				clipper.AddPaths(paths, ptSubject, true);
				for (const mergeCandidate of possibleMergeCandidates) {
					this.deleteShapes(mergeCandidate);
					clipper.AddPaths(mergeCandidate.getClipperPath(), ptClip, true);
				}

				paths = [];
				clipper.Execute(ctUnion, paths, pftPositive, pftPositive);
				clipper.Clear();
			}

			// Add the resulting merged shapes
			this.addShapes(HeightMap.#shapesFromClipperResult(paths).map(({ polygon, holes }) => new TerrainShape({
				polygon,
				holes,
				terrainTypeId,
				top,
				bottom
			})));
		}

		debug(`paintRegion took ${Math.round(performance.now() - startTimestamp)}ms`);
	}

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
	async paintCells(cells, terrainTypeId, height = 1, elevation = 0, options = {}) {
		for (const polygonWithHoles of polygonsFromGridCells(cells, canvas.grid))
			await this.paintRegion(polygonWithHoles, terrainTypeId, height, elevation, options);
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
		// TODO: this needs re-implementing
	}

	/**
	 * Erases a region from the heightmap, removing and breaking apart existing shapes where relevant.
	 * @param {{ polygon: ({ x: number; y: number; } | { X: number; Y: number; })[]; holes?: ({ x: number; y: number; } | { X: number; Y: number; })[][]; }} region
	 * @param {Object} [options]
	 * @param {string[]} [options.onlyTerrainTypeIds] A list of terrain type IDs to remove.
	 * @param {string[]} [options.excludingTerrainTypeIds] A list of terrain type IDs NOT to remove.
	 * @param {number} [options.bottom] The optional lower range to remove terrain from. Does not apply to no-height terrain.
	 * @param {number} [options.top] Optional upper range to remove terrain from. Does not apply to no-height terrain.
	 * @param {boolean} [options.history] Whether to track this change in the history tracker.
	 */
	async eraseRegion({ polygon, holes = [] }, { onlyTerrainTypeIds, excludingTerrainTypeIds, bottom, top, history = true } = {}) {
		bottom ??= -Infinity;
		top ??= Infinity;

		var outerPolygon = Polygon.createSolid(polygon);
		const holePolygons = holes.map(h => Polygon.createHole(h));

		// Create the clipper path from the polygons to ensure that the vertices are difined in the correct order
		const eraseShapePath = [
			outerPolygon.getClipperPath(),
			...holePolygons.map(h => h.getClipperPath())
		];

		// Find other shapes that we may need to combine with/erase
		const potentialOverlaps = this.getShapes(outerPolygon.boundingRect, {
			collisionTest: ({ t: shape }) =>
				onlyTerrainTypeIds?.includes(shape.terrainTypeId) !== false &&
				excludingTerrainTypeIds?.includes(shape.terrainTypeId) !== true &&
				(
					!shape.usesHeight || // terrain is a zone OR
					(shape.top > bottom && shape.bottom < top) // shape exists within the specified removal range
				)
		});

		for (const existingShape of potentialOverlaps) {
			const existingShapePath = existingShape.getClipperPath();

			const clipper = new ClipperLib.Clipper();
			clipper.AddPaths(existingShapePath, ClipperLib.PolyType.ptSubject, true);
			clipper.AddPaths(eraseShapePath, ClipperLib.PolyType.ptClip, true);

			// Intersection = areas of shape that are erased
			const intersectionResult = [];
			clipper.Execute(ClipperLib.ClipType.ctIntersection, intersectionResult, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);

			// If no part of the existing shape was touched by the erase region, do nothing
			if (intersectionResult.length === 0) continue;

			// Delete existing shape
			this.deleteShapes(existingShape);

			// If there would be any terrain left after an erase carved it out (e.g. an erase from h0->1 on a shape 1->2
			// would result in terrain from elevation 1 -> height 1 being left behind).
			const usesHeight = getTerrainType(existingShape.terrainTypeId)?.usesHeight;
			if (usesHeight && existingShape.top > top) {
				this.addShapes(HeightMap.#shapesFromClipperResult(intersectionResult).map(({ polygon, holes }) => new TerrainShape({
					terrainTypeId: existingShape.terrainTypeId,
					top: existingShape.top,
					bottom: top, // bottom of the shape is now the top of the eraser - everything below is erased
					polygon,
					holes
				})));
			}
			if (usesHeight && existingShape.bottom < bottom) {
				this.addShapes(HeightMap.#shapesFromClipperResult(intersectionResult).map(({ polygon, holes }) => new TerrainShape({
					terrainTypeId: existingShape.terrainTypeId,
					top: bottom, // top of the shape is now the bottom of the eraser - everything above is erased
					bottom: existingShape.bottom,
					polygon,
					holes
				})));
			}

			// Existing difference with erase = areas of existing shape that are NOT erased.
			// These shapes need to be added back on
			const unchangedExistingShapeResult = [];
			clipper.Execute(ClipperLib.ClipType.ctDifference, unchangedExistingShapeResult, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);

			this.addShapes(HeightMap.#shapesFromClipperResult(unchangedExistingShapeResult).map(({ polygon, holes }) => new TerrainShape({
				terrainTypeId: existingShape.terrainTypeId,
				top: existingShape.top,
				bottom: existingShape.bottom,
				polygon,
				holes
			})));
		}
	}

	/**
	 * Attempts to erase data from multiple cells at the given position.
	 * @param {[number, number][]} cells The locations of the cells to erase. Either [row, col] pairs
	 * or encoded cell keys.
	 * @param {Object} [options]
	 * @param {string[]} [options.onlyTerrainTypeIds] A list of terrain type IDs to remove.
	 * @param {string[]} [options.excludingTerrainTypeIds] A list of terrain type IDs NOT to remove.
	 * @param {number} [options.bottom] The optional lower range to remove terrain from. Does not apply to no-height terrain.
	 * @param {number} [options.top] Optional upper range to remove terrain from. Does not apply to no-height terrain.
	 */
	async eraseCells(cells, options = {}) {
		for (const polygonWithHoles of polygonsFromGridCells(cells, canvas.grid))
			await this.eraseRegion(polygonWithHoles, options);
	}

	/**
	 * Remove the given TerrainShape from the height map.
	 * @param {TerrainShape} shape Shape to remove.
	 */
	async eraseShape(shape) {
		if (this.deleteShapes(shape)) {
			await this.#saveChanges();
		}
	}

	async clear() {
		if (Object.keys(this.#data).length === 0) return false;
		this.#data = { shapes: [] };
		await this.#saveChanges();
		this.deleteAllShapes();
		return true;
	}

	// ------- //
	// History //
	// ------- //
	/**
	 * Pushes new history data onto the stack.
	 * @param {this["_history"][number]} historyEntry
	 */
	// TODO:
	/* #pushHistory(historyEntry) {
		this._history.push(historyEntry);

		// Limit the number of changes we store in the history, removing old entries first
		while (this._history.length > maxHistoryItems)
			this._history.shift();
	} */

	/**
	 * Undoes the most-recent change made to the height map.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	// TODO:
	/* async undo() {
		if (this._history.length <= 0) return false;

		const revertChanges = this._history.pop();

		for (const [position, state] of Object.entries(revertChanges)) {
			if (state?.length === 0)
				delete this.#data[position];
			else
				this.#data[position] = state;
		}

		this.#saveChanges();
		return true;
	} */


	// ----- //
	// Utils //
	// ----- //
	async #saveChanges() {
		return; // TODO: temporarily disabled

		/** @type {HeightMapDataV3} */
		const data = {
			v: DATA_VERSION,
			data: this.#data // TODO: filter out any shapes whose terrain type no longer exists
		};

		await canvas.scene.setFlag(moduleName, flags.heightData, data);
	}

	/**
	 * Takes a result from ClipperLib.Clipper.Execute and maps the polygons onto solid polygons and their holes.
	 * @param {ClipperLib.IntPoint[][]} result
	 */
	static #shapesFromClipperResult(result) {
		const polygons = result.map(vertices => new Polygon(vertices));

		/** @type {{ polygon: Polygon; holes: Polygon[]; }[]} */
		const polygonsWithHoles = polygons.filter(p => p.isSolid).map(p => ({ polygon: p, holes: [] }));

		for (const hole of polygons) {
			if (hole.isHole)
				polygonsWithHoles.find(({ polygon }) => polygon.containsPolygon(hole)).holes.push(hole);
		}

		return polygonsWithHoles;
	}
}

export const heightMap = new HeightMap();

// TODO: Remove. For debugging only only
globalThis.thtHeightMap = heightMap;

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
