import { moduleName, settings } from "../consts.mjs";
import { getCellsUnderTokenPosition, toSceneUnits } from "../utils/grid-utils.mjs";
import { getTerrainType } from "../utils/terrain-types.mjs";

/**
 * When dragging a token over solid terrain, changes the token's elevation to remain at the same elevation above the
 * surface (if the setting is enabled).
 * @param {TokenDocument} tokenDoc
 * @param {Partial<TokenDocument> & { _id: string; }} delta
 * @param {string} userId
 */
export function handleTokenElevationChange(tokenDoc, delta, _, userId) {
	// If the token was not updated by the current user, or the setting is disabled, do nothing
	if (userId !== game.userId || !game.settings.get(moduleName, settings.tokenElevationChange)) return;

	// If the token position or size hasn't changed, do nothing
	// If the elevation has been manually changed, do nothing (i.e. let that change take priority)
	if (["x", "y", "width", "height"].every(p => !(p in delta)) || "elevation" in delta) return;

	const terrainHeight1 = getHighestTerrainUnderToken(tokenDoc, isAltOrientation(tokenDoc));

	const terrainHeight2 = getHighestTerrainUnderToken({
		x: delta.x ?? tokenDoc.x,
		y: delta.y ?? tokenDoc.y,
		width: delta.width ?? tokenDoc.width,
		height: delta.height ?? tokenDoc.height
	}, isAltOrientation(tokenDoc));

	// If the heights before and after are different, work out the difference and then apply this to the token's elev
	if (terrainHeight1 !== terrainHeight2) {
		const heightDelta = terrainHeight2 - terrainHeight1;
		delta.elevation = Math.max(tokenDoc.elevation + toSceneUnits(heightDelta), 0);
	}
}

/**
 * Finds the highest terrain point under the given token position. This accounts for terrain height and elevation.
 * @param {{ x: number; y: number; width: number; height: number; }} position
 * @param {boolean} isAltOrientation
 */
function getHighestTerrainUnderToken(position, isAltOrientation) {
	/** @type {import("../geometry/height-map.mjs").HeightMap} */
	const hm = game.canvas.terrainHeightLayer._heightMap;

	let highest = 0;

	for (const cell of getCellsUnderTokenPosition(position, isAltOrientation)) {
		const terrain = hm.get(cell.x, cell.y);
		if (!terrain) continue; // no terrain at this cell

		const terrainType = getTerrainType(terrain.terrainTypeId);
		if (!terrainType.usesHeight || !terrainType.isSolid) continue; // non solid, treat as flat ground

		highest = Math.max(highest, terrain.elevation + terrain.height);
	}

	return highest;
}

// Cannot use HSS API's `isAltOrientation` because that requires a token, not a token document.
// This is basically a copy of that function though, using the token document instead.
function isAltOrientation(tokenDoc) {
	if (game.modules.get("hex-size-support")?.active !== true) return false;

	return !!(
		(game.settings.get("hex-size-support", "altOrientationDefault")) ^
		(tokenDoc.getFlag("hex-size-support", "alternateOrientation") ?? false)
	);
}
