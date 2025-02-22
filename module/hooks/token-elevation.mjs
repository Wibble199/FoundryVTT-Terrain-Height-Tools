import { moduleName, settings } from "../consts.mjs";
import { TerrainHeightLayer } from "../layers/terrain-height-layer.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";
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

	/** @type {Token | null} */
	const token = tokenDoc.object;
	if (!token) return;

	// If the token position or size hasn't changed, do nothing
	// If the elevation has been manually changed, do nothing (i.e. let that change take priority)
	if (["x", "y", "width", "height"].every(p => !(p in delta)) || "elevation" in delta) return;

	// Get highest terrain before move
	const terrainHeight1 = getHighestTerrainUnderToken(token);

	// Get highest terrain after move
	const terrainHeight2 = getHighestTerrainUnderToken(token, {
		x: delta.x ?? tokenDoc.x,
		y: delta.y ?? tokenDoc.y,
	});

	// If the heights before and after are different, work out the difference and then apply this to the token's elev
	if (terrainHeight1 !== terrainHeight2) {
		const heightDelta = terrainHeight2 - terrainHeight1;
		delta.elevation = Math.max(tokenDoc.elevation + toSceneUnits(heightDelta), 0);
	}
}

/**
 * When a token is created, if the token elevation option is enabled and the token is ontop of solid terrain, then set
 * the token's initial elevation.
 * @param {TokenDocument} tokenDoc
 * @param {string} userId
 */
export function handleTokenPreCreation(tokenDoc, _createData, _options, userId) {
	// If the token was not created by the current user, or the setting is disabled, do nothing
	if (userId !== game.userId || !game.settings.get(moduleName, settings.tokenElevationChange)) return;

	const terrainHeight = getHighestTerrainUnderToken(tokenDoc.object);

	tokenDoc.updateSource({ elevation: terrainHeight });
}

/**
 * Finds the highest terrain point under the given token position. This accounts for terrain height and elevation.
 * @param {Token} token
 * @param {{ x: number; y: number; }} [position]
 */
function getHighestTerrainUnderToken(token, position) {
	const hm = TerrainHeightLayer.current?._heightMap;

	// We may not want to get the cells under the current position. In this case, we need to work out the offset between
	// the token's actual position (which is what getOccupiedSpaces returns) and the desired position.
	const offset = position
		? { x: position.x - token.x, y: position.y - token.y }
		: { x: 0, y: 0 };

	let highest = 0;

	for (const space of token.getOccupiedSpaces()) {
		const { i, j } = canvas.grid.getOffset({ x: space.x + offset.x, y: space.y + offset.y });
		const terrains = hm.get(i, j);
		if (!(terrains?.length > 0)) continue; // no terrain at this cell

		for (const terrain of terrains) {
			const terrainType = getTerrainType(terrain.terrainTypeId);
			if (!terrainType.usesHeight || !terrainType.isSolid) continue; // zone or non solid, ignore it

			highest = Math.max(highest, terrain.elevation + terrain.height);
		}
	}

	return highest;
}
