/** @import { ColorAnimation } from "../data/aura.mjs"; */
import { html } from "lit";
import { AsyncDirective, directive } from "lit/async-directive.js";
import { classMap } from "lit/directives/class-map.js";
import { createRef, ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { easingFunctions } from "../../animation/easing-functions.mjs";
import { getColorAnimationValue } from "../../color/color-animation.mjs";
import { extractRgb } from "../../color/conversions.mjs";
import { styleColorAnimation } from "../../directives/style-color-animation.mjs";
import { AbstractDropdownElement } from "../abstract-dropdown/abstract-dropdown.mjs";
import "../color-picker/color-picker.mjs";
import "./color-animation-editor.css";

const elementName = "color-animation-editor-fwl";

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

/**
 * A custom element which appears as a dropdown and allows the user to create/edit a `ColorAnimation`.
 * Has a duration field, easing function choice, and keyframe editor.
 */
class ColorAnimationEditorElement extends AbstractDropdownElement {

	static properties = {
		value: { type: Object },
		_selectedKeyframeIndex: { state: true }
	};

	static dropdownClasses = "color-animation-editor-dropdown-fwl";

	static formAssociated = true;

	#internals;

	/** @type {{ value?: HTMLElement }} */
	#gradientPreviewRef = createRef();

	constructor() {
		super();

		this.#internals = this.attachInternals();

		/** @type {ColorAnimation} */
		this.value = {
			duration: 2500,
			easingFunc: "linear",
			keyframes: [
				{ color: 0xFF0000, alpha: 0.4, position: 0 },
				{ color: 0x0000FF, alpha: 0.4, position: 1 }
			]
		};

		this._selectedKeyframeIndex = 0;
	}

	get name() {
		return this.getAttribute("name");
	}

	set name(value) {
		this.setAttribute("name", value);
	}

	get form() {
		return this.#internals.form;
	}

	_renderButton() {
		// Using a directive for the animation rather than CSS means that the preview animation is synced up correctly
		// to the timeline indicator and to the auras on the canvas.
		return html`
			<div
				class="color-animation-editor-fwl-preview-bar"
				${styleColorAnimation(this.value, "--current-color")}
			></div>
		`;
	}

	_renderDropdown() {
		const keyframesRgb = this.value.keyframes.map(({ color, alpha, position }) => {
			const { r, g, b } = extractRgb(color);
			return { r, g, b, alpha, position };
		});

		const gradientStops = keyframesRgb
			.map(kf => `rgb(${kf.r} ${kf.g} ${kf.b} / ${Math.round(kf.alpha * 10000) / 100}%) ${Math.round(kf.position * 10000) / 100}%`)
			.join(", ");

		const selectedKeyframe = this.value.keyframes[this._selectedKeyframeIndex];

		return html`
			<div class="flexrow">
				<input
					type="number"
					min="1"
					step="1"
					.value=${this.value.duration}
					@input=${e => this.#updateAnimation({ duration: +e.target.value })}
					@blur=${() => this.#fireChangeEvent()}
					style="margin-right: 0.5rem"
				>
				<span>ms</span>

				<button
					class=${classMap({
						"color-animation-editor-fwl-ease-button": true,
						"btn-active-fwl": this.value.easingFunc === "linear"
					})}
					@click=${() => this.#updateAnimation({ easingFunc: "linear" })}
					data-tooltip=${l("GRIDAWAREAURAS.EasingLinear")}
				>
					<svg viewBox="-10 -10 120 120">
						<path d="M0,100 L100,0" />
					</svg>
				</button>
				<button
					class=${classMap({
						"color-animation-editor-fwl-ease-button": true,
						"btn-active-fwl": this.value.easingFunc === "easeInCubic"
					})}
					@click=${() => this.#updateAnimation({ easingFunc: "easeInCubic" })}
					data-tooltip=${l("GRIDAWAREAURAS.EasingEaseIn")}
				>
					<svg viewBox="-10 -10 120 120">
						<path d="M0,100 C32,100 67,100 100,0" />
					</svg>
				</button>
				<button
					class=${classMap({
						"color-animation-editor-fwl-ease-button": true,
						"btn-active-fwl": this.value.easingFunc === "easeOutCubic"
					})}
					@click=${() => this.#updateAnimation({ easingFunc: "easeOutCubic" })}
					data-tooltip=${l("GRIDAWAREAURAS.EasingEaseOut")}
				>
					<svg viewBox="0 0 100 100">
						<path d="M 0,100 C 33,0 68,0 100,0" />
					</svg>
				</button>
				<button
					class=${classMap({
						"color-animation-editor-fwl-ease-button": true,
						"btn-active-fwl": this.value.easingFunc === "easeInOutCubic"
					})}
					@click=${() => this.#updateAnimation({ easingFunc: "easeInOutCubic" })}
					data-tooltip=${l("GRIDAWAREAURAS.EasingEaseInOut")}
				>
					<svg viewBox="-10 -10 120 120">
						<path d="M0,100 C65,100 35,0 100,0" />
					</svg>
				</button>
			</div>

			<p class="hint">Click to add a new keyframe. Right-click a keyframe to delete it.</p>

			<div class="color-animation-editor-fwl-preview">
				<div
					class="color-animation-editor-fwl-preview-track"
					style=${styleMap({ "--gradient-stops": gradientStops })}
					@mousedown=${e => this.#createKeyframe(e)}
					${ref(this.#gradientPreviewRef)}
				></div>

				<div
					class="color-animation-editor-fwl-preview-tracker"
					style=${previewBarTrackerAnimation(this.value)}
				></div>

				${keyframesRgb.map(({ r, g, b, position }, idx) => html`
					<div
						class=${classMap({ "color-animation-editor-fwl-preview-thumb": true, "active": this._selectedKeyframeIndex === idx })}
						style=${styleMap({ "left": `${position * 100}%`, "--current-color-rgb": `${r} ${g} ${b}` })}
						@mousedown=${e => this.#selectKeyframe(e, idx)}
						@contextmenu=${() => this.#deleteKeyframe(idx)}
					></div>
				`)}
			</div>

			<div class="color-animation-editor-fwl-preview-thumb-properties-track">
				<div
					class="color-animation-editor-fwl-preview-thumb-properties"
					${ref(el => this.#setKeyframePropertiesContainerPosition(el))}
				>
					<input
						type="number"
						min="0"
						max="100"
						step="1"
						.value=${Math.round(selectedKeyframe.position * 100)}
						@input=${e => this.#updateSelectedKeyframe({ position: Math.min(Math.max(e.target.value / 100, 0), 1) })}
						@blur=${() => this.#fireChangeEvent()}
					>
					<span>%</span>

					<!-- <button
						type="button"
						@click=${() => this.#deleteKeyframe(this._selectedKeyframeIndex)}
					>
						<i class="fas fa-trash m-0"></i>
					</button> -->
				</div>
			</div>

			<color-picker-fwl
				.value=${{
					...extractRgb(selectedKeyframe.color),
					a: selectedKeyframe.alpha * 255
				}}
				@input=${e => this.#updateSelectedKeyframeColor(e.currentTarget.value)}
				@change=${() => this.#fireChangeEvent()}
			></color-picker-fwl>
		`;
	}

	/**
	 * @param {PointerEvent} event
	 * @param {number} keyframeIndex
	 */
	#selectKeyframe(event, keyframeIndex) {
		event.preventDefault();
		event.stopPropagation();

		this._selectedKeyframeIndex = keyframeIndex;
		this.#startDrag();
	}

	/** @param {PointerEvent} e */
	#dragKeyframe = e => {
		const { x, width } = this.#gradientPreviewRef.value.getBoundingClientRect();
		const pos = (e.clientX - x) / width;
		this.#updateSelectedKeyframe({ position: Math.max(Math.min(pos, 1), 0) });
	};

	/** @param {PointerEvent} e */
	#createKeyframe(e) {
		const insertPosition = e.offsetX / e.target.clientWidth;

		const { color, alpha, insertIndex } = getColorAnimationValue(this.value.keyframes, 1, "linear", insertPosition);

		this.#setValue({
			...this.value,
			keyframes: this.value.keyframes.toSpliced(insertIndex, 0, { color, alpha, position: insertPosition })
		});
		this.#fireChangeEvent();
		this._selectedKeyframeIndex = insertIndex;
		this.#startDrag();
	}

	/** @param {number} indexToDelete */
	#deleteKeyframe(indexToDelete) {
		if (typeof indexToDelete !== "number" || this.value.keyframes.length <= 1) return; // cannot delete only keyframe

		this.#setValue({
			...this.value,
			keyframes: this.value.keyframes.toSpliced(indexToDelete, 1)
		});
		this.#fireChangeEvent();
		this._selectedKeyframeIndex = Math.max(indexToDelete - 1, 0);
	}

	/**
	 * @param {Partial<ColorAnimation>} delta
	 */
	#updateAnimation(delta) {
		this.#setValue({ ...this.value, ...delta });
	}

	/**
	 * @param {Partial<ColorAnimation["keyframes"][0]>} delta
	 */
	#updateSelectedKeyframe(delta) {
		if (typeof this._selectedKeyframeIndex !== "number") return;

		const newKeyframes = [...this.value.keyframes];
		const editingKeyframe = newKeyframes[this._selectedKeyframeIndex];
		Object.assign(editingKeyframe, delta);

		if ("position" in delta) {
			newKeyframes.sort((a, b) => a.position - b.position);
			this._selectedKeyframeIndex = newKeyframes.indexOf(editingKeyframe);
		}

		this.#setValue({ ...this.value, keyframes: newKeyframes });
	}

	/**
	 * @param {import("../utils/color-utils.mjs").RGBA} rgba
	 */
	#updateSelectedKeyframeColor({ r, g, b, a }) {
		const color = (r << 16) | (g << 8) | b;
		this.#updateSelectedKeyframe({ color, alpha: a / 255 });
	}

	#startDrag() {
		const { body } = document;
		body.addEventListener("pointermove", this.#dragKeyframe);
		body.addEventListener("pointerup", () => {
			body.removeEventListener("pointermove", this.#dragKeyframe);
			this.#fireChangeEvent();
		}, { once: true });
	}

	/** @param {ColorAnimation} value */
	#setValue(value) {
		this.value = value;
		this.#internals.setFormValue(JSON.stringify(value));
		this.dispatchEvent(new Event("input", { bubbles: true, cancelable: false, composed: true }));
	}

	#fireChangeEvent() {
		this.dispatchEvent(new Event("change", { bubbles: true, cancelable: false, composed: true }));
	}

	/** @param {HTMLElement | undefined} el */
	#setKeyframePropertiesContainerPosition(el) {
		if (!el) return;
		Promise.resolve().then(() => {
			const { width } = el.getBoundingClientRect();
			const selectedKeyframe = this.value.keyframes[this._selectedKeyframeIndex];
			el.style.left = `min(max(calc(${selectedKeyframe.position * 100}% - ${width / 2}px), 0px), calc(100% - ${width}px))`;
		});
	}
}

if (!customElements.get(elementName)) {
	customElements.define(elementName, ColorAnimationEditorElement);
}


class PreviewBarTrackerAnimationDirective extends AsyncDirective {

	/** @type {ColorAnimation} */
	#animation;

	/** @type {number | null} */
	#animationRequestId = null;

	/**
	 * @param {ColorAnimation} animation
	 */
	render(animation) {
		this.#animation = animation;

		if (this.#animationRequestId) cancelAnimationFrame(this.#animationRequestId);
		this.#animationRequestId = requestAnimationFrame(this.#animate);
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
		if (!this.isConnected || this.#animation.duration <= 0) return;

		const t = (Date.now() / this.#animation.duration) % 1;
		const ease = easingFunctions[this.#animation.easingFunc];

		this.setValue(`left: ${Math.round(ease(t) * 10000) / 100}%`);

		this.#animationRequestId = requestAnimationFrame(this.#animate);
	};
}

/**
 * Directive for the preview bar tracker indicator. Using a directive to do a JS animation instead of a CSS animation
 * means that the tracker can be synced up with the preview color box.
 */
const previewBarTrackerAnimation = directive(PreviewBarTrackerAnimationDirective);
