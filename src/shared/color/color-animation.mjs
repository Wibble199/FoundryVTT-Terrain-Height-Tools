/** @import { EASING_FUNCTIONS } from "../animation/easing-functions.mjs" */
import { easingFunctions } from "../animation/easing-functions.mjs";
import { premultiply } from "./conversions.mjs";
import { interpolateColor, interpolateNumber } from "./interpolation.mjs";

/**
 * @typedef {Object} ColorAnimationKeyframe
 * @property {number} color
 * @property {number} alpha
 * @property {number} position
 */
/**
 * @typedef {Object} ColorAnimation
 * @property {ColorAnimationKeyframe[]} keyframes
 * @property {number} duration
 * @property {EASING_FUNCTIONS} easingFunc
 */

/**
 * Premultiplies the given colour keyframes with their associated alphas.
 * @param {ColorAnimationKeyframe[]} keyframes
 * @returns {ColorAnimationKeyframe[]}
 */
export function premultiplyKeyframes(keyframes) {
	return keyframes.map(({ color, alpha, position }) => ({ color: premultiply(color, alpha), alpha, position }));
}

/**
 * Gets the color and alpha of the animation at the given time.
 * @param {ColorAnimationKeyframe[]} keyframes Animation whose keyframes to search.
 * @param {number} duration
 * @param {EASING_FUNCTIONS} easingFuncName
 * @param {number} time
 */
export function getColorAnimationValue(keyframes, duration, easingFuncName, time) {
	const ease = easingFunctions[easingFuncName] ?? easingFunctions.linear;

	/** Time between 0-1, where 0 is the start of the animation and 1 is the end. */
	const animationTime = ease((time % duration) / duration);

	// If new position is before the first stop or after the last stop, there is nothing to interpolate against, so
	// use that color as-is
	if (animationTime <= keyframes[0].position) {
		return {
			color: keyframes[0].color,
			alpha: keyframes[0].alpha,
			insertIndex: 0
		};
	} else if (animationTime >= keyframes.at(-1).position) {
		return {
			color: keyframes.at(-1).color,
			alpha: keyframes.at(-1).alpha,
			insertIndex: keyframes.length
		};

	// Otherwise, find the two nearest neighbors and interpolate the t between them both
	} else {
		for (let i = 0; i < keyframes.length - 1; i++) {
			const a = keyframes[i];
			const b = keyframes[i + 1];

			if (a.position > animationTime || b.position < animationTime) continue;

			const tAB = (animationTime - a.position) / (b.position - a.position);
			const interpolatedColor = interpolateColor(a.color, b.color, tAB);
			const interpolatedAlpha = interpolateNumber(a.alpha, b.alpha, tAB);
			return { color: interpolatedColor, alpha: interpolatedAlpha, insertIndex: i + 1 };
		}
	}

	return { color: 0, alpha: 0, insertIndex: 0 }; // should never be possible, but just in case
}
