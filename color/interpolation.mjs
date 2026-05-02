/**
 * Interpolates two RGB colours.
 * @param {number} color1
 * @param {number} color2
 * @param {number} t Value from 0-1 for how far to interpolate the values.
 */
export function interpolateColor(color1, color2, t) {
	const r1 = (color1 >> 16) & 255;
	const g1 = (color1 >> 8) & 255;
	const b1 = color1 & 255;

	const r2 = (color2 >> 16) & 255;
	const g2 = (color2 >> 8) & 255;
	const b2 = color2 & 255;

	const r = Math.round(interpolateNumber(r1, r2, t));
	const g = Math.round(interpolateNumber(g1, g2, t));
	const b = Math.round(interpolateNumber(b1, b2, t));

	return (r << 16) | (g << 8) | b;
}

/**
 * Interpolates two numeric values.
 * @param {number} a
 * @param {number} b
 * @param {number} t Value from 0-1 for how far to interpolate the values.
 */
export function interpolateNumber(a, b, t) {
	return a + ((b - a) * t);
}
