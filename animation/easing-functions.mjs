/** @enum {keyof typeof EASING_FUNCTIONS} */
// eslint-disable-next-line @stylistic/js/no-extra-parens
export const EASING_FUNCTIONS = /** @type {const} */ ({
	linear: "EasingLinear",
	easeInCubic: "EasingEaseIn",
	easeOutCubic: "EasingEaseOut",
	easeInOutCubic: "EasingEaseInOut"
});

// From easings.net
/** @type {Record<EASING_FUNCTIONS, (v: number) => number>} */
export const easingFunctions = {
	linear: v => v,
	easeInCubic: v => Math.pow(v, 3),
	easeOutCubic: v => 1 - Math.pow(1 - v, 3),
	easeInOutCubic: v => v < 0.5 ? 4 * Math.pow(v, 3) : 1 - (Math.pow((-2 * v) + 2, 3) / 2)
};
