import { moduleName, settingNames } from "../consts.mjs";
import { heightMap } from "../geometry/height-map.mjs";
import { getTerrainType } from "../stores/terrain-types.mjs";
import { getSpacesUnderToken, toSceneUnits } from "../utils/grid-utils.mjs";

/**
 * When dragging a token over solid terrain, changes the token's elevation to remain at the same elevation above the
 * surface (if the setting is enabled).
 * @param {TokenDocument} tokenDoc
 * @param {Partial<TokenDocument> & { _id: string; }} delta
 * @param {{ isUndo?: boolean; }} options
 * @param {string} userId
 */
export function handleTokenElevationChange(tokenDoc, delta, { isUndo = false }, userId) {
	// If the token was not updated by the current user, or the setting is disabled, do nothing
	if (userId !== game.userId || !game.settings.get(moduleName, settingNames.tokenElevationChange)) return;

	// If the move is an undo move, then it will already be undoing a previous automatic token elevation change, so do
	// not run this logic (or else the token's elevation will change by twice as much as it should).
	if (isUndo) return;

	// If the token has not moved or changed size, then there will be no elevation change due to THT
	if (["x", "y", "width", "height"].every(prop => !(prop in delta))) return;

	const terrainHeightBeforeMove = getHighestTerrainUnderToken(tokenDoc);

	const terrainHeightAfterMove = getHighestTerrainUnderToken(tokenDoc, {
		x: delta.x ?? tokenDoc.x,
		y: delta.y ?? tokenDoc.y
	});

	// If the heights before and after are different, work out the difference and then apply this to the token's elev
	if (terrainHeightBeforeMove !== terrainHeightAfterMove) {
		// We prefer using the delta elevation over the document's elevation. E.G. if the token's elevation has changed,
		// then the user might be using something like elevation ruler so we (try to) keep compatibility with that.
		const heightDelta = terrainHeightAfterMove - terrainHeightBeforeMove;
		delta.elevation = (delta.elevation ?? tokenDoc.elevation) + toSceneUnits(heightDelta);
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
	if (userId !== game.userId || !game.settings.get(moduleName, settingNames.tokenElevationChange)) return;

	const terrainHeight = getHighestTerrainUnderToken(tokenDoc);

	tokenDoc.updateSource({ elevation: terrainHeight });
}

/**
 * Finds the highest terrain point under the given token position. This accounts for terrain height and elevation.
 * @param {TokenDocument} token
 * @param {{ x: number; y: number; }} [position]
 */
function getHighestTerrainUnderToken(tokenDocument, position) {

	// If a position has been provided, use that position. Otherwise, use the token's position.
	const { x, y } = position ?? tokenDocument;
	const { width, height, hexagonalShape } = tokenDocument;
	const { type: gridType, size: gridSize } = canvas.grid;

	let highest = 0;

	for (const space of getSpacesUnderToken(x, y, width, height, gridType, gridSize, hexagonalShape)) {
		const shapes = heightMap.getShapesAtPoint(space.x, space.y);
		if (!(shapes?.length > 0)) continue; // no terrain at this cell

		for (const shape of shapes) {
			const terrainType = getTerrainType(shape.terrainTypeId);
			if (!terrainType?.usesHeight || !terrainType.isSolid) continue; // zone or non solid, ignore it

			highest = Math.max(highest, shape.top);
		}
	}

	return highest;
}
