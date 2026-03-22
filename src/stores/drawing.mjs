/** @import { Signal } from "@lit-labs/preact-signals" */
/** @import { drawingModeTypes, terrainFillMode, terrainPaintMode } from "../consts.mjs" */
/** @import { DeepSignal } from "../utils/signal-utils.mjs"; */
import { signal } from "@preact/signals-core";
import { deepSignal } from "../utils/signal-utils.mjs";

/** @type {Signal<drawingModeTypes>} */
export const drawingMode$ = signal("gridCells");

/**
 * @typedef {Object} PaintingConfigModel
 * @property {string | undefined} terrainTypeId
 * @property {number} height
 * @property {number} elevation
 * @property {terrainPaintMode} mode
 * @property {terrainFillMode} floodMode
 */
/** @type {DeepSignal<PaintingConfigModel>} */
export const paintingConfig$ = deepSignal({
	terrainTypeId: undefined,
	height: 1,
	elevation: 0,
	mode: "additiveMerge",
	floodMode: "applicableBoundary"
});

/**
 * @typedef {Object} EraseConfigModel
 * @property {string[]} excludedTerrainTypeIds
 * @property {number | null} bottom
 * @property {number | null} top
 */
/** @type {DeepSignal<EraseConfigModel>} */
export const eraseConfig$ = deepSignal({
	excludedTerrainTypeIds: [], // we use an exclusion instead of inclusion so that the default selects all terrain types (without needing to load them)
	bottom: null,
	top: null
});

export const convertConfig$ = deepSignal({
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
