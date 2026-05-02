/**
 * @typedef {{ r: number; g: number; b: number; a: number; }} RGBA
 * Each component is a value within range 0-255 (inclusive).
 */
/**
 * @typedef {{ h: number; s: number; v: number; a: number; }} HSVA
 * `h` is a value between 0 (inclusive) and 360 (exclusive).
 * `s`, `v`, and `a` are values between 0 and 100 (inclusive).
 */

/**
 * Converts an RGBA object into an HSVA object.
 * @param {RGBA} rgba
 * @returns {HSVA}
 */
export function rgbaToHsva({ r, g, b, a }) {
	r /= 255;
	g /= 255;
	b /= 255;

	const xMax = Math.max(r, g, b);
	const xMin = Math.min(r, g, b);
	const delta = xMax - xMin;

	const v = xMax * 100;
	const s = xMax === 0 ? 0 : (delta / xMax) * 100;

	let h = 0;
	if (delta !== 0) {
		if (xMax === r) h = 60 * (((g - b) / delta) % 6);
		else if (xMax === g) h = 60 * (((b - r) / delta) + 2);
		else if (xMax === b) h = 60 * (((r - g) / delta) + 4);
		if (h < 0) h += 360;
	}

	return { h, s, v, a: Math.round((a / 255) * 100) };
}

/**
 * Converts a HSVA object into an RGBA object.
 * @param {HSVA} hsva
 * @returns {RGBA}
 */
export function hsvaToRgba({ h, s, v, a }) {
	h = (h % 360) / 360;
	s /= 100;
	v /= 100;

	const c = v * s;
	const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
	const m = v - c;

	let r = 0, g = 0, b = 0;
	if (0 <= h && h < 1 / 6) {
		r = c; g = x; b = 0;
	} else if (1 / 6 <= h && h < 2 / 6) {
		r = x; g = c; b = 0;
	} else if (2 / 6 <= h && h < 3 / 6) {
		r = 0; g = c; b = x;
	} else if (3 / 6 <= h && h < 4 / 6) {
		r = 0; g = x; b = c;
	} else if (4 / 6 <= h && h < 5 / 6) {
		r = x; g = 0; b = c;
	} else if (5 / 6 <= h && h < 1) {
		r = c; g = 0; b = x;
	}

	r = Math.round((r + m) * 255);
	g = Math.round((g + m) * 255);
	b = Math.round((b + m) * 255);
	a = Math.round((a / 100) * 255);

	return { r, g, b, a };
}

/**
 * Converts a hex string to a 4-component RGBA number. The input string may have 3, 4, 6, or 8 hex characters. It may
 * or may not have a single leading "#".
 * @param {string} hex
 * @returns {RGBA | undefined} returns `undefined` if the input was not valid.
 */
export function parseHexString(hex) {
	// Not a string
	if (typeof hex !== "string")
		return undefined;

	// 6 or 8 digit hex
	const hex68 = /^#?(?<r>[a-f0-9]{2})(?<g>[a-f0-9]{2})(?<b>[a-f0-9]{2})(?<a>[a-f0-9]{2})?$/i.exec(hex);
	if (hex68) {
		const { r, g, b, a } = hex68.groups;
		return { r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16), a: parseInt(a ?? "ff", 16) };
	}

	// 3 or 4 digit hex
	const hex34 = /^#?(?<r>[a-f0-9])(?<g>[a-f0-9])(?<b>[a-f0-9])(?<a>[a-f0-9])?$/i.exec(hex);
	if (hex34) {
		const { r, g, b, a } = hex34.groups;
		// Multiply by 17 to treat 1 digit as 2 digits. We use the base + 1. E.G. if this was in base 10, and we had
		// the digit 7, and we wanted 77, we would multiply by 11. Therefore in base 16 we multiply by 17.
		return { r: parseInt(r, 16) * 17, g: parseInt(g, 16) * 17, b: parseInt(b, 16) * 17, a: parseInt(a ?? "f", 16) * 17 };
	}

	// Invalid string
	return undefined;
}

/**
 * Converts an RGBA object into a 4-component hex string.
 * @param {RGBA} rgba
 */
export function toHexString({ r, g, b, a }) {
	return "#" + [r, g, b, a]
		.map(v => Math.max(Math.min(Math.round(v), 255), 0).toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Extracts the individual red, green, and blue components from a colour value.
 * @param {number} color
 */
export function extractRgb(color) {
	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;
	return { r, g, b };
}

/**
 * Multiplies the RGB values of a colour by the given alpha.
 * @param {number} color RGB colour to premultiply.
 * @param {number} alpha Alpha as a 0-1 value.
 */
export function premultiply(color, alpha) {
	if (alpha === 0) return 0x000000;

	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;

	const premultR = Math.max(0, Math.min(Math.round(r * alpha), 255));
	const premultG = Math.max(0, Math.min(Math.round(g * alpha), 255));
	const premultB = Math.max(0, Math.min(Math.round(b * alpha), 255));

	return (premultR << 16) | (premultG << 8) | premultB;
}

/**
 * Unpremultiplies the RGB values of a colour by the given alpha.
 * @param {number} color RGB colour to unpremultiply.
 * @param {number} alpha Alpha as a 0-1 value.
 */
export function unpremultiply(color, alpha) {
	return premultiply(color, 1 / alpha);
}

/**
 * Converts a color into it's CSS `rgb()` equivalent.
 * @param {number | string | RGBA} color Number, hexadecimal string, or RGBA object.
 * @param {number} [alpha] Alpha in range 0-1.
 */
export function toCssRgbString(color, alpha) {
	const { r = 0, g = 0, b = 0, a = 255 } = (typeof color === "string" ? parseHexString(color) : typeof color === "number" ? extractRgb(color) : color) ?? {};
	return `rgb(${r} ${g} ${b} / ${Math.round(100 * (alpha ?? (a / 255)))}%)`;
}
