/** @import { DeepSignal } from "../utils/signal.mjs" */
import { fromObject, Signal } from "../utils/signal.mjs";

/**
 * Config state for the Line of Sight ruler.
 *
 * If `h2` is `undefined`, it should use the defined `h1` value.
 * @type {DeepSignal<{ p1: { x: number; y: number; } | undefined; h1: number; p2: { x: number; y: number; } | undefined; h2: number | undefined; }>}
*/
// Note that we track p1/p2 separately from h1/h2 so that it's easier to clear the position of the ruler without clearing the heights.
export const lineOfSightRulerConfig$ = fromObject({
	p1: undefined,
	h1: 1,
	p2: undefined,
	h2: undefined
});

/**
 * Config state for the Token Line of Sight tool.
 * @type {DeepSignal<{ token1: Token | undefined, h1: number; token2: Token | undefined; h2: number; }>}
*/
export const tokenLineOfSightConfig$ = fromObject({
	token1: undefined,
	h1: 0,
	token2: undefined,
	h2: 0
});

export const includeNoHeightTerrain$ = new Signal(false);
