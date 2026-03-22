/** @import { terrainPaintMode as TerrainPaintMode, terrainFillMode as TerrainFillMode } from "../consts.mjs" */
/** @import { HeightMapDataV3 } from "../utils/height-map-migrations.mjs" */
/** @import { PointLike } from "./point.mjs" */
import { difference as polygonDifference, intersection as polygonIntersection, union as polygonUnion } from "polygon-clipping";
import { flags, moduleName } from "../consts.mjs";
import { TerrainProvider } from "../stores/terrain-manager.mjs";
import { getTerrainType, terrainTypeMap$, terrainTypes$ } from "../stores/terrain-types.mjs";
import { groupBy2 } from "../utils/array-utils.mjs";
import { polygonsFromGridCells } from "../utils/grid-utils.mjs";
import { DATA_VERSION, migrateData } from "../utils/height-map-migrations.mjs";
import { debug } from "../utils/log.mjs";
import { Polygon } from "./polygon.mjs";
import { TerrainShape } from "./terrain-shape.mjs";

const maxHistoryItems = 10;

/**
 * Manages height map data for a scene, providing read/update functionality.
 */
export class HeightMap extends TerrainProvider {

	/** @type {HeightMapDataV3[]} */
	#history = [];

	get canUndo() {
		return this.#history.length > 0;
	}

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
		// Load data from scene flags and migrate it from an old format if needed
		const sceneFlagData = canvas.scene.getFlag(moduleName, flags.heightData);
		const data = migrateData(sceneFlagData, canvas.grid).data;

		// Strip out any shapes whose terrain type IDs have been deleted
		data.shapes = data.shapes.filter(s => terrainTypeMap$.value.has(s.terrainTypeId));

		this.setShapes(...data.shapes.map(shape => new TerrainShape(shape)));
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
	 * @param {{ polygon: PointLike[]; holes?: PointLike[][]; }} region
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @param {number} elevation The elevation of the terrain to paint.
	 * @param {Object} [options]
	 * @param {TerrainPaintMode} [options.mode] How to handle existing terrain:
	 * - `"totalReplace"` - Completely overwrites all existing terrain data in the cells with the new data.
	 * - `"additiveMerge"` - Merges the new terrain data with the existing data, without removing any overlapping terrain.
	 * - `"destructiveMerge"` - Merges the new terrain data with the existing data, removing existing overlapping terrain.
	 * @param {boolean} [options.persist] Whether to persist changes to history tracker and to scene data.
	 * @returns true if any changes have been made
	 */
	async paintRegion({ polygon, holes = [] }, terrainTypeId, height = 0, elevation = 0, { mode = "totalReplace", persist = true } = {}) {
		return await this.#withPersistence(async () => {
			const terrainType = getTerrainType(terrainTypeId);
			if (!terrainType) throw new Error(`Invalid terrain type ID '${terrainTypeId}'`);

			const startTimestamp = performance.now();

			const top = elevation + height;
			const bottom = elevation;

			const outerPolygon = Polygon.createSolid(polygon);
			const holePolygons = holes.map(h => Polygon.createHole(h));

			let hasChanges = false;

			// This array will hold the GeoJSON polygon results of the operations for the newly created shapes with their
			// values height values.
			let newShapePaths = [
				{
					top,
					bottom,
					paths: [
						[
							outerPolygon.toGeoJsonRing(),
							...holePolygons.map(h => h.toGeoJsonRing())
						]
					]
				}
			];

			// STAGE 1: Update the new or existing shapes according to vertical overlaps.
			switch (true) {
				// If doing total replace, just clip any existing shapes in the polygon area.
				// Leave newShapePaths unchanged.
				case mode === "totalReplace": {
					hasChanges = await this.eraseRegion({ polygon, holes }, { persist: false }) || hasChanges;
					break;
				}

				// If doing a destructive merge of a non-zone, remove other non-zones in the polygon area and height range
				// Leave newShapePaths unchanged.
				case mode === "destructiveMerge" && terrainType.usesHeight: {
					const nonZoneTerrainTypeIds = terrainTypes$.value.filter(t => t.usesHeight).map(t => t.id);
					hasChanges = await this.eraseRegion({ polygon, holes }, { onlyTerrainTypeIds: nonZoneTerrainTypeIds, top, bottom, persist: false }) || hasChanges;
					break;
				}

				// If doing a destructive merge of a zone, remove other zones in the polygon area
				// Leave newShapePaths unchanged.
				case mode === "destructiveMerge" && !terrainType.usesHeight: {
					const zoneTerrainTypeIds = terrainTypes$.value.filter(t => !t.usesHeight).map(t => t.id);
					hasChanges = await this.eraseRegion({ polygon, holes }, { onlyTerrainTypeIds: zoneTerrainTypeIds, persist: false }) || hasChanges;
					break;
				}

				// If doing an additive merge of a non-zone, need to modify the newShapePaths to carve out areas that are
				// overlapping existing terrain.
				// Need to adjust the newShapePaths array so that we cut any shapes out of that which overlap existing
				// terrain.
				case mode === "additiveMerge" && terrainType.usesHeight: {
					// We don't care about the terrain types of the existing terrain, so just combine the clipper paths of
					// shapes with identical top/bottom values.
					/** @type {Map<string, { top: number; bottom: number; paths: [number, number][][] }>} */
					const existingShapePaths = groupBy2(
						this.getShapes(outerPolygon.boundingRect, {
							collisionTest: ({ t: shape }) => shape.usesHeight && shape.top > bottom && shape.bottom < top
						}),
						shape => `${shape.top}|${shape.bottom}`,
						shapes => ({ top: shapes[0].top, bottom: shapes[0].bottom, paths: shapes.flatMap(shape => shape.toGeoJsonPolygon()) })
					);

					for (const [, existingShape] of existingShapePaths) {
						// Put the changes into a new array, then replace the entire existing array with the new one.
						// I.E. this is so we do NOT modify the array as we're iterating over it too.
						// Also, naming things is hard :(
						/** @type {typeof newShapePaths} */
						const newNewShapePaths = [];

						/** @type {(paths: [number, number][][][], top: number, bottom: number) => void} */
						const addNewNewShapePath = (paths, top, bottom) => {
							const existing = newNewShapePaths.find(p => p.top === top && p.bottom === bottom);
							if (existing)
								existing.paths.push(...paths);
							else
								newNewShapePaths.push({ paths: Array.from(paths), top, bottom });
						};

						for (const newShapePath of newShapePaths) {
							// Work out the intersection between the new shape and the existing shape. If the new shape
							// could fit above or below the existing shape, add those height/elevation ranges to the paths.
							const intersection = polygonIntersection(newShapePath.paths, existingShape.paths);

							if (newShapePath.bottom < existingShape.bottom)
								addNewNewShapePath(intersection, existingShape.bottom, newShapePath.bottom);

							if (newShapePath.top > existingShape.top)
								addNewNewShapePath(intersection, newShapePath.top, existingShape.top);

							// Work out the difference - i.e. the part of the new shape untouched by the existing shape,
							// and add it to the paths at the full height (i.e. this bit hasn't been carved out).
							const newShapePathOnly = polygonDifference(newShapePath.paths, existingShape.paths);
							addNewNewShapePath(newShapePathOnly, newShapePath.top, newShapePath.bottom);
						}

						newShapePaths = newNewShapePaths;
					}

					break;
				}

				// If doing an additive merge of a zone, don't need to do anything here, just the merge in stage 2 :)
			}

			// STAGE 2: Merge the new terrain with any adjacent existing terrain of the same type, top, & bottom and add
			// to the scene
			for (const { top, bottom, paths } of newShapePaths) {
				hasChanges ||= paths.length > 0;
				this.#addShapeAndMergeWithAdjacent(paths, terrainTypeId, top, bottom);
			}

			debug(`paintRegion took ${Math.round(performance.now() - startTimestamp)}ms`);

			return hasChanges;
		}, persist);
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
	 * @returns true if any changes have been made
	 */
	async paintCells(cells, terrainTypeId, height = 1, elevation = 0, options = {}) {
		return await this.#withPersistence(async () => {
			let anyChanges = false;
			for (const polygonWithHoles of polygonsFromGridCells(cells, canvas.grid))
				anyChanges = await this.paintRegion(polygonWithHoles, terrainTypeId, height, elevation, { ...options, persist: false }) || anyChanges;
			return anyChanges;
		});
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
	 * @returns true if any changes have been made
	 */
	async fillCells(originCell, terrainTypeId, height = 1, elevation = 0, { mode = "applicableBoundary" } = {}) {
		// TODO: this needs re-implementing
	}

	/**
	 * Erases a region from the heightmap, removing and breaking apart existing shapes where relevant.
	 * @param {{ polygon: PointLike[]; holes?: PointLike[][]; }} region
	 * @param {Object} [options]
	 * @param {string[]} [options.onlyTerrainTypeIds] A list of terrain type IDs to remove.
	 * @param {string[]} [options.excludingTerrainTypeIds] A list of terrain type IDs NOT to remove.
	 * @param {number} [options.bottom] The optional lower range to remove terrain from. Does not apply to no-height terrain.
	 * @param {number} [options.top] Optional upper range to remove terrain from. Does not apply to no-height terrain.
	 * @param {boolean} [options.persist] Whether to persist changes to history tracker and to scene data.
	 * @returns true if any changes have been made
	 */
	async eraseRegion({ polygon, holes = [] }, { onlyTerrainTypeIds, excludingTerrainTypeIds, bottom, top, persist = true } = {}) {
		return await this.#withPersistence(() => {
			const startTimestamp = performance.now();

			bottom ??= -Infinity;
			top ??= Infinity;

			let anyChanges = false;

			var outerPolygon = Polygon.createSolid(polygon);
			const holePolygons = holes.map(h => Polygon.createHole(h));

			// Create the clipper path from the polygons to ensure that the vertices are difined in the correct order
			const eraseShapePath = [
				outerPolygon.toGeoJsonRing(),
				...holePolygons.map(h => h.toGeoJsonRing())
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
				const existingShapePath = existingShape.toGeoJsonPolygon();

				// Intersection = areas of shape that are erased
				const intersectionResult = polygonIntersection(existingShapePath, eraseShapePath);

				// If no part of the existing shape was touched by the erase region, do nothing
				if (!intersectionResult || intersectionResult.length === 0) continue;

				anyChanges = true;

				// Delete existing shape
				this.deleteShapes(existingShape);

				// If there would be any terrain left after an erase carved it out (e.g. an erase from h0->1 on a shape 1->2
				// would result in terrain from elevation 1 -> height 1 being left behind).
				const usesHeight = getTerrainType(existingShape.terrainTypeId)?.usesHeight;
				if (usesHeight && existingShape.top > top) {
					// bottom of the shape is now the top of the eraser - everything below is erased
					this.#addShapeAndMergeWithAdjacent(intersectionResult, existingShape.terrainTypeId, existingShape.top, top);
				}
				if (usesHeight && existingShape.bottom < bottom) {
					// top of the shape is now the bottom of the eraser - everything above is erased
					this.#addShapeAndMergeWithAdjacent(intersectionResult, existingShape.terrainTypeId, bottom, existingShape.bottom);
				}

				// Existing difference with erase = areas of existing shape that are NOT erased.
				// These shapes need to be added back on
				const unchangedExistingShapeResult = polygonDifference(existingShapePath, eraseShapePath);
				this.#addShapeAndMergeWithAdjacent(unchangedExistingShapeResult, existingShape.terrainTypeId, existingShape.top, existingShape.bottom);
			}

			debug(`eraseRegion took ${Math.round(performance.now() - startTimestamp)}ms`);

			return anyChanges;
		}, persist);
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
	 * @returns true if any changes have been made
	 */
	async eraseCells(cells, options = {}) {
		return await this.#withPersistence(async () => {
			let anyChanges = false;
			for (const polygonWithHoles of polygonsFromGridCells(cells, canvas.grid))
				anyChanges = await this.eraseRegion(polygonWithHoles, { ...options, persist: false }) || anyChanges;
			return anyChanges;
		});
	}

	/**
	 * Remove the given TerrainShape from the height map.
	 * @param {TerrainShape} shape Shape to remove.
	 * @returns true if any changes have been made
	 */
	async eraseShape(shape) {
		return await this.#withPersistence(() => {
			return this.deleteShapes(shape);
		});
	}

	/**
	 * Removes all shapes from the height map.
	 * @returns true if any changes have been made
	 */
	async clear() {
		return await this.#withPersistence(() => {
			if (this.terrainShapes$.size === 0) return false;
			this.deleteAllShapes();
			return true;
		});
	}

	/**
	 * Adds the given polygons to the height map, merging them with adjacent terrain of the same type, height and
	 * elevation. This includes both vertical (height) and horizontal (x/y) adjacent terrain.
	 *
	 * This is not the complete painting algorithm, use paintRegion for that instead which will correctly combine with
	 * other existing terrain based on the painting mode. This is instead a reusable utility function.
	 * @param {[number, number][][][]} polygons
	 * @param {string} terrainTypeId
	 * @param {number} top
	 * @param {number} bottom
	 */
	#addShapeAndMergeWithAdjacent(polygons, terrainTypeId, top, bottom) {
		let newShapePaths = [
			{
				top,
				bottom,
				polygons
			}
		];

		// STAGE 1: VERTICAL (NON-ZONES ONLY)
		if (getTerrainType(terrainTypeId)?.usesHeight) {
			// Get existing terrain of the same type that is within the new drawn range, and is touching or overlapping
			// vertically, and group them by which have the same top/bottom.
			const possibleVMergeCandidates = groupBy2(
				this.getShapesMulti(
					HeightMap.#shapesFromGeoJson(polygons).map(p => p.polygon.boundingRect),
					{
						collisionTest: ({ t: shape }) =>
							shape.terrainTypeId === terrainTypeId &&
							shape.bottom <= top &&
							shape.top >= bottom
					}
				),
				shape => `${shape.top}|${shape.bottom}`,
				shapes => ({
					top: shapes[0].top,
					bottom: shapes[0].bottom,
					shapes,
					polygons: shapes.map(shape => shape.toGeoJsonPolygon())
				})
			);

			/** @type {Set<TerrainShape>} */
			const existingShapesToDelete = new Set();

			for (const [, existingShape] of possibleVMergeCandidates) {
				// Put the changes into a new array, then replace the entire existing array with the new one.
				// I.E. this is so we do NOT modify the array as we're iterating over it too.
				// Also, naming things is hard :(
				/** @type {typeof newShapePaths} */
				const newNewShapePaths = [];

				/**
				 * Adds or appends a shape in the newNewShapePaths array for the given height range.
				 * @type {(paths: [number, number][][][], top: number, bottom: number) => void}
				 */
				const addNewNewShapePath = (polygons, top, bottom) => {
					const existing = newNewShapePaths.find(p => p.top === top && p.bottom === bottom);
					if (existing)
						existing.polygons.push(...polygons);
					else
						newNewShapePaths.push({ polygons: Array.from(polygons), top, bottom });
				};

				for (const newShapePath of newShapePaths) {
					// Work out the intersection between the new shape and the existing shapes. If there is any overlap,
					// then we combine their tops/bottoms, and add that to the newNewShapePaths array, and remove the
					// overlap from the current newShapePath.
					const intersection = polygonIntersection(newShapePath.polygons, existingShape.polygons);

					if (intersection.length === 0) {
						addNewNewShapePath(newShapePath.polygons, newShapePath.top, newShapePath.bottom);
						continue;
					}

					addNewNewShapePath(intersection, Math.max(existingShape.top, newShapePath.top), Math.min(existingShape.bottom, newShapePath.bottom));

					const newShapeOnlyPolygon = polygonDifference(newShapePath.polygons, existingShape.polygons);
					addNewNewShapePath(newShapeOnlyPolygon, newShapePath.top, newShapePath.bottom);

					const existingOnlyPolygon = polygonDifference(existingShape.polygons, newShapePath.polygons);
					addNewNewShapePath(existingOnlyPolygon, existingShape.top, existingShape.bottom);

					existingShape.shapes.forEach(s => existingShapesToDelete.add(s));
				}

				newShapePaths = newNewShapePaths;
			}

			this.deleteShapes(...existingShapesToDelete);
		}

		// STAGE 2: HORIZONTAL
		// Get all shapes that might be mergable with the new polygon(s)
		for (let { top, bottom, polygons } of newShapePaths) {
			const possibleHMergeCandidates = new Set(HeightMap.#shapesFromGeoJson(polygons)
				.flatMap(({ polygon: { boundingBox: { x1, y1, w, h } } }) => [...this.getShapes(
					new PIXI.Rectangle(x1 - 1, y1 - 1, w + 2, h + 2),
					{
						collisionTest: ({ t: shape }) =>
							shape.terrainTypeId === terrainTypeId &&
							shape.top === top &&
							shape.bottom === bottom
					}
				)]));

			// For each possible merge, delete it and union it with the incoming polygons
			// Not sure if there is an easy way of detecting if two polygons have merged - if so, could save destroying and
			// recreating shapes that do not overlap at all. Cannot use intersection as shapes that touch but do not overlap
			// would not give any result. Then again, it's probably not much of an issue to delete and recreate.
			polygons = polygonUnion(polygons, Array.from(possibleHMergeCandidates, s => s.toGeoJsonPolygon()));
			this.deleteShapes(...possibleHMergeCandidates);

			// Add unioned shapes in
			this.addShapes(HeightMap.#shapesFromGeoJson(polygons).map(({ polygon, holes }) => new TerrainShape({
				polygon,
				holes,
				terrainTypeId,
				top,
				bottom
			})));
		}
	}

	// ------- //
	// History //
	// ------- //
	/**
	 * Makes a snapshot of the shapes on the canvas before executing the function.
	 * If the function returns a boolean, then persists the snapshot to the history stack and saves the new height map
	 * data to the scene.
	 * @param {() => Promise<boolean> | boolean} func Function to run. Should return a boolean indicating if any changes
	 * were made which need to be persisted to the history/scene flags.
	 * @param {boolean} [persist] Can be used to easily turn off persistence if required.
	 * @returns forwards the result of the `func`
	 */
	async #withPersistence(func, persist = true) {
		// If persistence disabled, just run the function
		if (!persist) return await func();

		// Generate a 'before' snapshot
		const snapshot = this.#getSnapshot();

		// Run the function
		const anyChanges = await func();

		// If anything has changed, save the scene data and history
		if (anyChanges) {
			await canvas.scene.setFlag(moduleName, flags.heightData, this.#getSnapshot());
			this.#history.push(snapshot);

			// Limit the number of changes we store in the history, removing old entries first
			while (this.#history.length > maxHistoryItems)
				this.#history.shift();
		}

		return anyChanges;
	}

	/**
	 * Undoes the most-recent change made to the height map.
	 */
	async undo() {
		if (this.#history.length <= 0) return;
		const previousState = this.#history.pop();
		await canvas.scene.setFlag(moduleName, flags.heightData, previousState);
	}

	/**
	 * Gets a snapshot of the current height map data.
	 * @returns {HeightMapDataV3}
	 */
	#getSnapshot() {
		return {
			v: DATA_VERSION,
			data: {
				shapes: [...this.terrainShapes$.value].map(s => s.toObject())
			}
		};
	}

	// ----- //
	// Utils //
	// ----- //
	/**
	 * Takes a GeoJSON polygon or multipolygon and maps them onto an object with polygon and holes, suitable for
	 * constructing a TerrainShape.
	 * @param {[number, number][][][] | [number, number][][]} result
	 */
	static #shapesFromGeoJson(result) {
		if (result.length === 0) return [];

		const isMultiPolygon = Array.isArray(result[0][0]);
		if (isMultiPolygon) {
			return result.map(rings => ({
				polygon: new Polygon(rings[0]),
				holes: rings.slice(1).map(ring => new Polygon(ring))
			}));
		} else {
			return [{
				polygon: new Polygon(result[0]),
				holes: result.slice(1).map(ring => new Polygon(ring))
			}];
		}
	}
}

export const heightMap = new HeightMap();
