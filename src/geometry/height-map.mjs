/** @import { terrainPaintMode as TerrainPaintMode, terrainFillMode as TerrainFillMode } from "../consts.mjs" */
/** @import { HeightMapDataV3 } from "../utils/height-map-migrations.mjs" */
import { flags, moduleName } from "../consts.mjs";
import { TerrainProvider } from "../stores/terrain-manager.mjs";
import { getTerrainType, terrainTypes$ } from "../stores/terrain-types.mjs";
import { polygonsFromGridCells } from "../utils/grid-utils.mjs";
import { DATA_VERSION, migrateData } from "../utils/height-map-migrations.mjs";
import { Polygon } from "./polygon.mjs";
import { TerrainShape } from "./terrain-shape.mjs";

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
		const outerPolygon = Polygon.createSolid(polygon);
		const holePolygons = holes.map(h => Polygon.createHole(h));

		// Create the clipper path from the polygons to ensure that the vertices are difined in the correct order
		// This array will be the result of the Clipper operations for the newly created shape
		let newShapePaths = [
			outerPolygon.getClipperPath(),
			...holePolygons.map(h => h.getClipperPath())
		];

		// Clip each potentially overlapping shape with the new region being painted
		// We do not need to clip all shapes with each other since they will have already been clipped
		for (const shape of this.getShapes(outerPolygon.boundingRect)) {
			const existingShapePath = shape.getClipperPath();

			const clipper = new ClipperLib.Clipper();
			clipper.AddPaths(newShapePaths, ClipperLib.PolyType.ptSubject, true);
			clipper.AddPaths(existingShapePath, ClipperLib.PolyType.ptClip, true);

			const intersectionResult = [];
			clipper.Execute(ClipperLib.ClipType.ctIntersection, intersectionResult, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);

			// If no intersection, then we do not have to worry about changing the original shape so can just skip
			if (intersectionResult.length === 0) continue;

			// New difference existing = parts of the new region that don't overlap
			const newRegionDifferenceExisting = [];
			clipper.Execute(ClipperLib.ClipType.ctDifference, newRegionDifferenceExisting, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);

			clipper.Clear();
			clipper.AddPaths(existingShapePath, ClipperLib.PolyType.ptSubject, true);
			clipper.AddPaths(newShapePaths, ClipperLib.PolyType.ptClip, true);

			// Existing difference new = unchanged parts of the original shape
			const existingDifferenceNewRegion = [];
			clipper.Execute(ClipperLib.ClipType.ctDifference, existingDifferenceNewRegion, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);

			// DEBUG
			this.setShapes(
				HeightMap.#shapesFromClipperResult(intersectionResult).map(({ polygon, holes }) => new TerrainShape({
					terrainTypeId: terrainTypes$.value[1].id,
					height: 1,
					polygon,
					holes
				})),
				HeightMap.#shapesFromClipperResult(newRegionDifferenceExisting).map(({ polygon, holes }) => new TerrainShape({
					terrainTypeId: terrainTypes$.value[2].id,
					height: 1,
					polygon,
					holes
				})),
				HeightMap.#shapesFromClipperResult(existingDifferenceNewRegion).map(({ polygon, holes }) => new TerrainShape({
					terrainTypeId: terrainTypes$.value[3].id,
					height: 1,
					polygon,
					holes
				}))
			);
		}
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
	 */
	async eraseRegion({ polygon, holes = [] }, { onlyTerrainTypeIds, excludingTerrainTypeIds, bottom, top } = {}) {
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
					!getTerrainType(shape.terrainTypeId).usesHeight || // terrain is a zone OR
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
		/** @type {{ polygon: Polygon; holes: Polygon[]; }[]} */
		const polygonsWithHoles = [];

		for (const clipperPolygon of result) {
			if (Polygon.isClockwise(clipperPolygon)) {
				polygonsWithHoles.push({ polygon: new Polygon(clipperPolygon), holes: [] });
			} else {
				polygonsWithHoles.at(-1).holes.push(new Polygon(clipperPolygon));
			}
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
