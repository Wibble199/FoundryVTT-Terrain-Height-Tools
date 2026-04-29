import { unsafeHTML } from "lit/directives/unsafe-html.js";

/**
 * @param {Object} [options]
 * @param {string} [options.name]
 * @param {string} [options.value]
 * @param {string} [options.placeholder]
 */
export function colorPicker({ name, value, placeholder } = {}) {
	// For some reason, using <range-picker> in Lit html doesn't work with bindings properly - neither attribute nor property bindings.
	return unsafeHTML(`<color-picker
		name="${name}"
		value="${value}"
		${placeholder ? `placeholder="${placeholder}"` : ""}
	></color-picker>`);
}
