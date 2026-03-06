/** @import { Signal } from "@preact/signals-core" */
import { signal } from "@preact/signals-core";

/**
 * Note that we track p1/p2 separately from h1/h2 so that it's easier to clear the position of the ruler without
 * clearing the heights.
 * @typedef {Object} LineOfSightRulerConfigModel
 * @property {{ x: number; y: number; } | undefined} p1
 * @property {number} h1
 * @property {{ x: number; y: number; } | undefined} p2
 * @property {number | undefined} h2 If `undefined`, should use the defined `h1` value.
 */
/** @type {Signal<LineOfSightRulerConfigModel>} */
export const lineOfSightRulerConfig$ = signal({
	p1: undefined,
	h1: 1,
	p2: undefined,
	h2: undefined
});

/**
 * @typedef {Object} TokenLineOfSightConfigModel
 * @property {Token | undefined} token1
 * @property {number} h1
 * @property {Token | undefined} token2
 * @property {number} h2
 */
/** @type {Signal<TokenLineOfSightConfigModel>} */
export const tokenLineOfSightConfig$ = signal({
	token1: undefined,
	h1: 0,
	token2: undefined,
	h2: 0
});

export const includeNoHeightTerrain$ = signal(false);
