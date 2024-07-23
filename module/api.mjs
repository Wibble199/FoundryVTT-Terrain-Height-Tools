// ! These are functions specifically for macros and scripts.
// ! Changing these functions should always be done in a backwards-compatible way.

import { moduleName, settings } from "./consts.mjs";
import { HeightMap } from "./geometry/height-map.mjs";
import { LineOfSightRulerLayer } from "./layers/line-of-sight-ruler-layer.mjs";
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
 * @param {number} terrain.elevation If the terrain type uses heights, the elevation (how high off the ground) to paint these cells.
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
	return hm.paintCells(cells, terrainType.id, terrain.height ?? 0, terrain.elevation ?? 0, { overwrite });
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

/**
 * Calculates the start and end points of line of right rays between two tokens. One from the left-most point of token1
 * to the left-most point of token2, one from centre to centre, and one between the right-most points.
 * @param {Token} token1 The first token to draw line of sight from.
 * @param {Token} token2 The second token to draw line of sight to.
 * @param {Object} [options={}] Options that change how the calculation is done.
 * @param {number | undefined} [options.token1RelativeHeight] How far the ray starts vertically relative to token1. The
 * height is calculated as `token1.elevation + (token1RelativeHeight * token1.size)`. If undefined, uses the
 * world-configured default value.
 * @param {number | undefined} [options.token2RelativeHeight] How far the ray ends vertically relative to token2. The
 * height is calculated as `token2.elevation + (token2RelativeHeight * token2.size)`. If undefined, uses the
 * world-configured default value.
 */
export function calculateLineOfSightRaysBetweenTokens(token1, token2, { token1RelativeHeight, token2RelativeHeight } = {}) {
	const defaultRelativeHeight = game.settings.get(moduleName, settings.defaultTokenLosTokenHeight);
	const [left, centre, right] = LineOfSightRulerLayer._calculateRaysBetweenTokens(token1, token2, token1RelativeHeight ?? defaultRelativeHeight, token2RelativeHeight ?? defaultRelativeHeight);
	return {
		left: { p1: left[0], p2: left[1] },
		centre: { p1: centre[0], p2: centre[1] },
		right: { p1: right[0], p2: right[1] }
	};
}

/**
 * Calculates and draws a line of sight ray between the given points.
 * Note that this will clear all previously drawn lines, INCLUDING those drawn by the tools in the side bar.
 * @param {import("./layers/line-of-sight-ruler-layer.mjs").Point3D} p1 The first point (where the line is drawn from).
 * @param {import("./layers/line-of-sight-ruler-layer.mjs").Point3D} p2 The second point (where the line is drawn to).
 * @param {Object} [options={}] Options that change for the lines are drawn.
 * @param {boolean} [options.drawForOthers=true] Whether to draw these rays for other users connected to the game.
 * @param {} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a height
 * value will be included in the drawn line. They are treated as having infinite height.
 * @param {} [options.showLabels=true] Whether height labels are shown at the start and end of the ruler.
 */
export function drawLineOfSightRay(p1, p2, { drawForOthers = true, includeNoHeightTerrain = false, showLabels = true } = {}) {
	if (!LineOfSightRulerLayer._isPoint3d(p1)) throw new Error("`p1` is not a valid Point3D. Expected an object with `x`, `y`, and `h` properties.");
	if (!LineOfSightRulerLayer._isPoint3d(p2)) throw new Error("`p2` is not a valid Point3D. Expected an object with `x`, `y`, and `h` properties.");
	return drawLineOfSightRays([{ p1, p2, options: { includeNoHeightTerrain, showLabels } }], { drawForOthers });
}

/**
 * Calculates and draws any number of line of sight rays between the given points.
 * Note that this will clear all previously drawn lines, INCLUDING those drawn by the tools in the side bar.
 * @param {({ p1: import("./layers/line-of-sight-ruler-layer.mjs").Point3D; p2: import("./layers/line-of-sight-ruler-layer.mjs").Point3D; } & import("./layers/line-of-sight-ruler-layer.mjs").RulerOptions)[]} rays
 * @param {Object} [options={}] Options that change for the lines are drawn.
 * @param {boolean} [options.drawForOthers=true] Whether to draw these rays for other users connected to the game.
 */
export function drawLineOfSightRays(rays, { drawForOthers = true } = {}) {
	/** @type {LineOfSightRulerLayer} */
	const ruler = game.canvas.terrainHeightLosRulerLayer;
	ruler._drawLineOfSightRays(rays.map(({ p1, p2, ...options }) => [p1, p2, options]), { drawForOthers });
}

/**
 * Calculates and draws line of sight rays between two tokens, as per the token line of sight tool.
 * Note that currently only one set of lines can be drawn, attempting to draw any other lines of sight will clear these
 * lines, INCLUDING those drawn by the tools in the side bar.
 * @param {Token} token1 The first token to draw line of sight from.
 * @param {Token} token2 The second token to draw line of sight to.
 * @param {Object} [options={}] Options that change how the calculation is done.
 * @param {number | undefined} [options.token1RelativeHeight] How far the ray starts vertically relative to token1. The
 * height is calculated as `token1.elevation + (token1RelativeHeight * token1.size)`. If undefined, uses the
 * world-configured default value.
 * @param {number | undefined} [options.token2RelativeHeight] How far the ray ends vertically relative to token2. The
 * height is calculated as `token2.elevation + (token2RelativeHeight * token2.size)`. If undefined, uses the
 * world-configured default value.
 * @param {boolean} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a
 * height value will be included in the return list. They are treated as having infinite height.
 * @param {boolean} [options.drawForOthers] Whether to draw these rays for other users connected to the game.
 */
export function drawLineOfSightRaysBetweenTokens(token1, token2, { token1RelativeHeight, token2RelativeHeight, includeNoHeightTerrain = false, drawForOthers = true } = {}) {
	const { left, centre, right } = calculateLineOfSightRaysBetweenTokens(token1, token2, { token1RelativeHeight, token2RelativeHeight });

	/** @type {LineOfSightRulerLayer} */
	const ruler = game.canvas.terrainHeightLosRulerLayer;
	ruler._drawLineOfSightRays([
		[left.p1, left.p2, { includeNoHeightTerrain, showLabels: false }],
		[centre.p1, centre.p2, { includeNoHeightTerrain, showLabels: true }],
		[right.p1, right.p2, { includeNoHeightTerrain, showLabels: false }],
	], { drawForOthers });
}

/**
 * Removes all lines of sight drawn by this user, INCLUDING those drawn by the tools in the side bar.
 */
export function clearLineOfSightRays() {
	/** @type {LineOfSightRulerLayer} */
	const ruler = game.canvas.terrainHeightLosRulerLayer;
	ruler._clearLineOfSightRays({ clearForOthers: true });
}
