/** @import { DeepSignal } from "../utils/signal.mjs" */
import { fromObject } from "../utils/signal.mjs";

/**
 * @typedef {Object} PaintingConfigObj
 * @property {string | undefined} terrainTypeId
 * @property {number} height
 * @property {number} elevation
 * @property {import("../consts.mjs").terrainPaintMode} mode
 * @property {import("../consts.mjs").terrainFillMode} floodMode
 */
/**
 * Config state for the paint tool.
 * @type {DeepSignal<PaintingConfigObj>}
 */
export const paintingConfig$ = fromObject({
	terrainTypeId: undefined,
	height: 1,
	elevation: 0,
	mode: "totalReplace",
	floodMode: "applicableBoundary"
});

/**
 * Config state for the erase tool.
 * @type {DeepSignal<{ excludedTerrainTypeIds: string[]; bottom: number | null; top: number | null; }>}
 */
export const eraseConfig$ = fromObject({
	excludedTerrainTypeIds: [], // we use an exclusion instead of inclusion so that the default selects all terrain types (without needing to load them)
	bottom: null,
	top: null
});

/**
 * Config state for the conversion tool.
 */
export const convertConfig$ = fromObject({
	toDrawing: true,
	toRegion: false,
	toWalls: false,
	wallConfig: {
		move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
		light: CONST.WALL_SENSE_TYPES.NORMAL,
		sight: CONST.WALL_SENSE_TYPES.NORMAL,
		sound: CONST.WALL_SENSE_TYPES.NORMAL,
		dir: CONST.WALL_DIRECTIONS.BOTH,
		door: CONST.WALL_DOOR_TYPES.NONE,
		ds: CONST.WALL_DOOR_STATES.CLOSED,
		threshold: {
			light: null,
			sight: null,
			sound: null,
			attenuation: false
		}
	},
	setWallHeightFlags: true,
	deleteAfter: true
});
