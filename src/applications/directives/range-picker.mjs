import { unsafeHTML } from "lit/directives/unsafe-html.js";

/**
 * @param {Object} [options]
 * @param {string} [options.name]
 * @param {number | string} [options.value]
 * @param {number} [options.min]
 * @param {number} [options.max]
 * @param {number} [options.step]
 */
export function rangePicker({ name = "range", value, min, max, step } = {}) {
	// For some reason, using <range-picker> in Lit html doesn't work with bindings properly - neither attribute nor property bindings.
	return unsafeHTML(`<range-picker
		name="${name}"
		value="${value}"
		min="${min}"
		max="${max}"
		step="${step}"
	></range-picker>`);
}
