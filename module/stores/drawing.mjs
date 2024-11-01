/** @import { DeepSignal } from "../utils/signal.mjs" */
import { fromObject } from "../utils/signal.mjs";

/**
 * Config state for the painting and filling tools.
 * @type {DeepSignal<{ terrainTypeId: string | undefined; height: number; elevation: number; }>}
 */
export const paintingConfig$ = fromObject({
	terrainTypeId: undefined,
	height: 1,
	elevation: 0
});

/**
 * Config state for the erasing and erasing fill tools.
 * @type {DeepSignal<{ excludedTerrainTypeIds: string[]; bottom: number | undefined; top: number | undefined; }>}
 */
export const eraseConfig$ = fromObject({
	excludedTerrainTypeIds: [], // we use an exclusion instead of inclusion so that the default selects all terrain types (without needing to load them)
	bottom: undefined,
	top: undefined
});

/**
 * Config state for the conversion tool.
 */
export const convertConfig$ = fromObject({
	toDrawings: true,
	toWalls: false,
	deleteAfter: true
});
