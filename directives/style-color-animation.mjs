/** @import { ElementPart } from "lit" */
/** @import { ColorAnimation } from "../color/color-animation.mjs" */
import { noChange, nothing } from "lit";
import { AsyncDirective, directive } from "lit/async-directive.js";
import { getColorAnimationValue, premultiplyKeyframes } from "../color/color-animation.mjs";
import { unpremultiply } from "../color/conversions.mjs";

class StyleColorAnimationDirective extends AsyncDirective {

	/** @type {HTMLElement} */
	#element;

	/** @type {ColorAnimation} */
	#animation;

	/** @type {ColorAnimation["keyframes"]} */
	#premultKeyframes;

	/** @type {string} */
	#cssPropertyName;

	/** @type {number | null} */
	#animationRequestId = null;

	/**
	 * @param {ColorAnimation} animation
	 * @param {string} [cssPropertyName]
	 * @override
	 */
	// eslint-disable-next-line no-unused-vars
	render(animation, cssPropertyName) {
		return nothing;
	}

	/**
	 * @param {ElementPart} part
	 * @param {Parameters<this["render"]>} params
	 * @override
	 */
	update(part, [animation, cssPropertyName]) {
		this.#element = part.element;
		this.#animation = animation;
		this.#premultKeyframes = premultiplyKeyframes(animation.keyframes);
		this.#cssPropertyName = cssPropertyName;

		if (this.#animationRequestId) cancelAnimationFrame(this.#animationRequestId);
		this.#animationRequestId = requestAnimationFrame(this.#animate);

		return noChange;
	}

	reconnected() {
		if (this.#animationRequestId) cancelAnimationFrame(this.#animationRequestId);
		this.#animationRequestId = requestAnimationFrame(this.#animate);
	}

	disconnected() {
		if (this.#animationRequestId) cancelAnimationFrame(this.#animationRequestId);
		this.#animationRequestId = null;
	}

	#animate = () => {
		if (!this.isConnected || !this.#element || this.#animation.duration <= 0 || this.#animation.keyframes.length === 0) return;

		let { color, alpha } = getColorAnimationValue(
			this.#premultKeyframes,
			this.#animation.duration,
			this.#animation.easingFunc,
			Date.now()
		);

		color = unpremultiply(color, alpha);
		const r = (color >> 16) & 255;
		const g = (color >> 8) & 255;
		const b = color & 255;

		this.#element.style.setProperty(this.#cssPropertyName, `rgb(${r} ${g} ${b} / ${Math.round(alpha * 10000) / 100}%)`);

		this.#animationRequestId = requestAnimationFrame(this.#animate);
	};
}

/**
 * Directive for setting a CSS property on the associated element to the current color of an animation.
 *
 * Using a directive to do a JS animation instead of a CSS animation means that the animation is globally synced.
 */
export const styleColorAnimation = directive(StyleColorAnimationDirective);
