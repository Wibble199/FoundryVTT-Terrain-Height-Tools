/** @import { ElementPart } from "lit" */
/** @import { ColorAnimationKeyframe } from "../../shared/color/color-animation.mjs" */
/** @import { TerrainType } from "../../stores/terrain-types.mjs" */
import { nothing } from "lit";
import { AsyncDirective, directive } from "lit/async-directive.js";
import { getColorAnimationValue, premultiplyKeyframes } from "../../shared/color/color-animation.mjs";
import { toCssRgbString, unpremultiply } from "../../shared/color/conversions.mjs";
import { LINE_TYPES } from "../../shared/consts.mjs";

/**
 * @typedef {Object} StyleTerrainColorDirectiveOptions
 * Leaving one of the CSS property name options blank will disable the setting of that property.
 * @property {string} fillColorCssPropertyName CSS property name to map fill color onto. Default = "background-color".
 * @property {string} lineColorCssPropertyName CSS property name to map line color onto. Default = "border-color".
 * @property {string} lineWidthCssPropertyName CSS property name to map line width onto. Default = "border-width".
 * @property {string} textColorCssPropertyName CSS property name to map text color onto. Default = "color".
 */

class StyleTerrainColorDirective extends AsyncDirective {

	/** @type {HTMLElement} */
	#element;

	/** @type {TerrainType} */
	#terrainType;

	/** @type {ColorAnimationKeyframe[] | null} */
	#fillPremultipliedKeyframes;

	/** @type {ColorAnimationKeyframe[] | null} */
	#linePremultipliedKeyframes;

	/** @type {ColorAnimationKeyframe[] | null} */
	#textPremultipliedKeyframes;

	/** @type {StyleTerrainColorDirectiveOptions} */
	#options;

	/** @type {number | null} */
	#animationRequestId;

	get #isAnimated() {
		return (!!this.#terrainType?.fillColorAnimation && this.#options?.fillColorCssPropertyName.length > 0)
			|| (!!this.#terrainType?.lineColorAnimation && this.#options?.lineColorCssPropertyName.length > 0)
			|| (!!this.#terrainType?.textColorAnimation && this.#options?.textColorCssPropertyName.length > 0);
	}

	/**
	 * @param {TerrainType} terrainType
	 * @param {Partial<StyleTerrainColorDirectiveOptions>} options
	 */
	// eslint-disable-next-line no-unused-vars
	render(terrainType, options) {
		return nothing;
	}

	/**
	 * @param {ElementPart} part
	 * @param {Parameters<StyleTerrainColorDirective["render"]>} params
	 */
	update(part, [terrainType, options]) {
		this.#element = part.element;
		this.#terrainType = terrainType;
		this.#options = {
			fillColorCssPropertyName: "background-color",
			lineColorCssPropertyName: "border-color",
			lineWidthCssPropertyName: "border-width",
			textColorCssPropertyName: "color",
			...options ?? {}
		};

		this.#fillPremultipliedKeyframes = terrainType.fillColorAnimation
			? premultiplyKeyframes(terrainType.fillColorAnimation.keyframes)
			: null;

		this.#linePremultipliedKeyframes = terrainType.lineColorAnimation
			? premultiplyKeyframes(terrainType.lineColorAnimation.keyframes)
			: null;

		this.#textPremultipliedKeyframes = terrainType.textColorAnimation
			? premultiplyKeyframes(terrainType.textColorAnimation.keyframes)
			: null;

		this.#updateCss();
	}

	reconnected() {
		this.#updateCss();
	}

	disconnected() {
		this.#clearAnimationFrameRequest();
	}

	#updateCss = () => {
		if (!this.#element || !this.#options) return;

		const now = Date.now();
		const { fillColorCssPropertyName, lineColorCssPropertyName, lineWidthCssPropertyName, textColorCssPropertyName } = this.#options;

		// Fill color
		if (fillColorCssPropertyName.length && this.#terrainType.fillType !== CONST.DRAWING_FILL_TYPES.NONE) {
			if (this.#fillPremultipliedKeyframes) {
				const { duration, easingFunc } = this.#terrainType.fillColorAnimation;
				const { color, alpha } = getColorAnimationValue(this.#fillPremultipliedKeyframes, duration, easingFunc, now);
				this.#element.style.setProperty(fillColorCssPropertyName, toCssRgbString(unpremultiply(color, alpha), alpha));

			} else {
				const { fillColor, fillOpacity } = this.#terrainType;
				this.#element.style.setProperty(fillColorCssPropertyName, toCssRgbString(fillColor, fillOpacity));
			}
		}

		// Line color
		if (lineColorCssPropertyName.length && this.#terrainType.lineType !== LINE_TYPES.NONE) {
			if (this.#linePremultipliedKeyframes) {
				const { duration, easingFunc } = this.#terrainType.lineColorAnimation;
				const { color, alpha } = getColorAnimationValue(this.#linePremultipliedKeyframes, duration, easingFunc, now);
				this.#element.style.setProperty(lineColorCssPropertyName, toCssRgbString(unpremultiply(color, alpha), alpha));

			} else {
				const { lineColor, lineOpacity } = this.#terrainType;
				this.#element.style.setProperty(lineColorCssPropertyName, toCssRgbString(lineColor, lineOpacity));
			}
		}

		// Line width
		if (lineWidthCssPropertyName.length && this.#terrainType.lineType !== LINE_TYPES.NONE) {
			this.#element.style.setProperty(lineWidthCssPropertyName, this.#terrainType.lineWidth + "px");
		}

		// Text color
		if (textColorCssPropertyName.length) {
			if (this.#textPremultipliedKeyframes) {
				const { duration, easingFunc } = this.#terrainType.textColorAnimation;
				const { color, alpha } = getColorAnimationValue(this.#textPremultipliedKeyframes, duration, easingFunc, now);
				this.#element.style.setProperty(textColorCssPropertyName, toCssRgbString(unpremultiply(color, alpha), alpha));

			} else {
				const { textColor, textOpacity } = this.#terrainType;
				this.#element.style.setProperty(textColorCssPropertyName, toCssRgbString(textColor, textOpacity));
			}
		}

		this.#requestAnimationFrameIfRequired();
	};

	#requestAnimationFrameIfRequired() {
		if (!this.#isAnimated) return;
		if (this.#animationRequestId) cancelAnimationFrame(this.#animationRequestId);
		this.#animationRequestId = requestAnimationFrame(this.#updateCss);
	}

	#clearAnimationFrameRequest() {
		if (this.#animationRequestId) cancelAnimationFrame(this.#animationRequestId);
		this.#animationRequestId = null;
	}
}

/**
 * Directive which sets CSS properties to match that of the given terrain type. If the terrain type uses animated
 * line or fill, then animates those CSS properies.
 */
export const styleTerrainColor = directive(StyleTerrainColorDirective);
