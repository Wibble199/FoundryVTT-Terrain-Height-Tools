// ! These are functions specifically for macros and scripts.
// ! Changing these functions should always be done in a backwards-compatible way.

import { HeightMap } from "./geometry/height-map.mjs";
import { getTerrainTypes } from "./utils/terrain-types.mjs";

export { getTerrainTypes } from "./utils/terrain-types.mjs";

/**
 * Attempts to find a terrain type with the given name or ID.
 * @param {Object} terrain The terrain to search for.
 * @param {string} terrain.id The ID of the terrain type to find. Either this or `name` must be provided.
 * @param {string} terrain.name The name of the terrain type to find. Either this or `id` must be provided.
 * @returns {import("./utils/terrain-types.mjs").TerrainType | undefined}
 */
export function getTerrainType(terrain) {
	if (!terrain?.id?.length && !terrain?.name?.length)
		throw new Error("Expected `terrain` to have an `id` or `name` property.");

	const types = getTerrainTypes();
	return types.find(t => t.id === terrain.id || t.name === terrain.name);
}

/**
 * Gets the terrain data at the given grid coordinates.
 * @param {number} x
 * @param {number} y
 * @param {{ terrainTypeId: string; height: number; } | undefined}
 */
export function getCell(x, y) {
	/** @type {import("./geometry/height-map.mjs").HeightMap} */
	const hm = game.canvas.terrainHeightLayer._heightMap;
	return hm.get(y, x);
}

/**
 * Paints the target cells on the current scene with the provided terrain data.
 * @param {[number, number][]} cells The grid cells to paint as [X,Y] coordinate pairs. The cells do not have to be
 * connected.
 * @param {Object} terrain The terrain options to use when painting the cells.
 * @param {string} terrain.id The ID of the terrain type to use. Either this or `name` must be provided.
 * @param {string} terrain.name The name of the terrain type to use. Either this or `id` must be provided.
 * @param {number} terrain.height If the terrain type uses heights, the height to paint on these cells.
 * @param {Object} [options]
 * @param {boolean} [options.overwrite] Whether or not to overwrite already-painted cells with the new terrain data.
 * @returns {Promise<boolean>}
 */
export function paintCells(cells, terrain, { overwrite = true } = {}) {
	if (!Array.isArray(cells) || cells.some(cell => !Array.isArray(cell)))
		throw new Error("Expected `cells` to be an array of arrays.");
	if (cells.length === 0) return;

	const terrainType = getTerrainType(terrain);
	if (!terrainType)
		throw new Error(`Could not find a terrain type with ID "${terrain.id}" or name "${terrain.name}"`);

	if (terrainType.usesHeight && typeof terrain.height !== "number")
		throw new Error(`Terrain "${terrainType.name}' requires a height, but one was not provided.`);

	/** @type {import("./geometry/height-map.mjs").HeightMap} */
	const hm = game.canvas.terrainHeightLayer._heightMap;
	return hm.paintCells(cells, terrainType.id, terrain.height ?? 0, { overwrite });
}

/**
 * Erases terrain height data from the given cells on the current scene.
 * @param {[number, number][]} cells
 * @returns {Promise<boolean>}
 */
export function eraseCells(cells) {
	if (!Array.isArray(cells) || cells.some(cell => !Array.isArray(cell)))
		throw new Error("Expected `cells` to be an array of arrays.");
	if (cells.length === 0) return;

	/** @type {import("./geometry/height-map.mjs").HeightMap} */
	const hm = game.canvas.terrainHeightLayer._heightMap;
	return hm.eraseCells(cells);
}

/**
 * Calculates the line of sight between the two given pixel coordinate points and heights.
 * Returns an array of all shapes that were intersected, along with the regions where those shapes were intersected.
 * @param {{ x: number; y: number; h: number; }} p1 The first point, where `x` and `y` are pixel coordinates.
 * @param {{ x: number; y: number; h: number; }} p2 The second point, where `x` and `y` are pixel coordinates.
 * @param {Object} [options={}] Options that change how the calculation is done.
 * @param {boolean} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a
 * height value will be included in the return list. They are treated as having infinite height.
 * @returns {(import('./geometry/height-map.mjs').LineOfSightIntersectionRegion & { terrainTypeId: string; height: number; })[]}
 */
export function calculateLineOfSight(p1, p2, options = {}) {
	return HeightMap.flattenLineOfSightIntersectionRegions(calculateLineOfSightByShape(p1, p2, options));
}

/**
 * Calculates the line of sight between the two given pixel coordinate points and heights.
 * Returns an array of all shapes that were intersected, along with the regions where those shapes were intersected.
 * @param {{ x: number; y: number; h: number; }} p1 The first point, where `x` and `y` are pixel coordinates.
 * @param {{ x: number; y: number; h: number; }} p2 The second point, where `x` and `y` are pixel coordinates.
 * @param {Object} [options={}] Options that change how the calculation is done.
 * @param {boolean} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a
 * height value will be included in the return list. They are treated as having infinite height.
 * @returns {{ shape: import('./geometry/height-map.mjs').HeightMapShape; regions: import('./geometry/height-map.mjs').LineOfSightIntersectionRegion[]; }[]}
 */
export function calculateLineOfSightByShape(p1, p2, options = {}) {
	/** @type {import("./geometry/height-map.mjs").HeightMap} */
	const hm = game.canvas.terrainHeightLayer._heightMap;
	return hm.calculateLineOfSight(p1, p2, options);
}
