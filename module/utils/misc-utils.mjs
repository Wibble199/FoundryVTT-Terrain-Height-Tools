import { moduleName, settings } from "../consts.mjs";

/**
 * Rounds the value to the nearest multiple of the given precision.
 * @param {number} value
 * @param {number} precision
 */
export function roundTo(value, precision) {
	return Math.round(value / precision) * precision;
}

/**
 * If the setting to use fractions is turned on, converts the number to use fractions where applicable.
 * @param {number} v
 * @returns {string}
 */
export function prettyFraction(v) {
	if (!game.settings.get(moduleName, settings.useFractionsForLabels))
		return v + "";

	const floored = Math.floor(v);
	switch (v % 1) {
		case 0.5: return (floored === 0 ? "" : floored) + "½";
		case 0.25: return (floored === 0 ? "" : floored) + "¼";
		case 0.75: return (floored === 0 ? "" : floored) + "¾";
		default: return v + "";
	}
}
