// ! These are functions specifically for macros and scripts.
// ! Changing these functions should always be done in a backwards-compatible way.

import { getTerrainTypes } from './utils/terrain-types.mjs';

/**
 * Paints the target cells on the current scene with the provided terrain data.
 * @param {[number, number][]} cells The grid cells to paint as [X,Y] coordinate pairs. The cells do not have to be
 * connected.
 * @param {Object} terrain The terrain options to use when painting the cells.
 * @param {string} terrain.id The ID of the terrain type to use. Either this or `name` must be provided.
 * @param {string} terrain.name The name of the terrain type to use. Either this or `id` must be provided.
 * @param {number} terrain.height If the terrain type uses heights, the height to paint on these cells.
 * @returns {Promise<boolean>}
 */
export function paintCells(cells, terrain) {
	if (!Array.isArray(cells) || cells.some(cell => !Array.isArray(cell)))
		throw new Error("Expected `cells` to be an array of arrays.");
	if (cells.length === 0) return;

	if (!terrain?.id?.length && !terrain?.name?.length)
		throw new Error("Expected `terrain` to have an `id` or `name` property.");

	const types = getTerrainTypes();
	const terrainType = types.find(t => t.id === terrain.id || t.name === terrain.name);
	if (!terrainType)
		throw new Error(`Could not find a terrain type with ID '${terrain.id}' or name '${terrain.name}'`);

	if (terrainType.usesHeight && typeof terrain.height !== "number")
		throw new Error(`Terrain '${terrainType.name}' requires a height, but one was not provided.`);

	/** @type {import("./geometry/height-map.mjs").HeightMap} */
	const hm = game.canvas.terrainHeightLayer._heightMap;
	return hm.paintCells(cells, terrainType.id, terrain.height ?? 0);
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
