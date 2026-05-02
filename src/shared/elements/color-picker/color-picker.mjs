/** @import { RGBA, HSVA } from "../utils/color-utils.mjs"; */
import { html, LitElement, noChange } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { hsvaToRgba, parseHexString, rgbaToHsva, toHexString } from "../../color/conversions.mjs";
import "./color-picker.css";

export const elementName = "color-picker-fwl";

/**
 * Colour picker component that renders in-line, rather than popping up a dialog like an `<input type="color">`.
 */
class ColorPickerElement extends LitElement {

	static properties = {
		_rawValue: { state: true }
	};

	static formAssociated = true;

	#id = foundry.utils.randomID();

	#internals;

	#hexInputRef = createRef();

	#colorSpaceAreaRef = createRef();

	constructor() {
		super();

		this.#internals = this.attachInternals();

		// HSV makes it a lot easier to deal with the colour picker, since "S" is just the hue slider value, "S" is just
		// the X-axis and "V" is the Y-axis. With other colour systems we'd have to do some awkward calculations or use
		// a different style of colour picker.
		/** @type {HSVA} */
		this._rawValue = { h: 0, s: 100, v: 100, a: 100 };
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

	get value() {
		return hsvaToRgba(this._rawValue);
	}

	set value(value) {
		const hsva = rgbaToHsva(value);
		if (hsva) this._rawValue = hsva;
	}

	render() {
		const hsva = this._rawValue;
		const rgba = hsvaToRgba(hsva);
		const hex = toHexString(rgba);

		return html`
			<div class="color-picker-fwl-interactive">
				<div
					class="color-picker-fwl-color-space"
					tabindex="0"
					@pointerdown=${this.#colorSpacePointerDown}
					style=${styleMap({ "--current-color-hue": hsva.h })}
					${ref(this.#colorSpaceAreaRef)}
				>
					<div
						class="color-picker-fwl-color-space-thumb"
						style=${styleMap({
							top: (Math.round((100 - hsva.v) * 100) / 100) + "%",
							left: (Math.round(hsva.s * 100) / 100) + "%"
						})}
					></div>
				</div>

				<div class="flexrow gap-05rem">
					<div class="flexcol gap-05rem">
						<input
							type="range"
							class="color-picker-fwl-hue-range"
							min="0"
							max="359"
							step="1"
							.value=${hsva.h}
							@input=${e => this.#updateHsva(e, "h")}
						>

						<input
							type="range"
							class="color-picker-fwl-alpha-range"
							min="0"
							max="100"
							step="1"
							.value=${hsva.a}
							@input=${e => this.#updateHsva(e, "a")}
							style=${styleMap({ "--current-color-rgb": `${rgba.r} ${rgba.g} ${rgba.b}` })}
						>
					</div>
				</div>
			</div>

			<div class="color-picker-fwl-inputs">
				<!-- Don't update .value if the user is focused on element, otherwise as they are typing it will keep
				reformatting what they type. On blur, request an update so the text is reformatted then instead. -->
				<div style="margin-bottom: 0.5rem;">
					<label for=${`color-picker-fwl-${this.#id}-hex`}>Hex</label>
					<input
						type="text"
						id=${`color-picker-fwl-${this.#id}-hex`}
						maxlength="9"
						.value=${document.activeElement === this.#hexInputRef.value ? noChange : hex}
						@input=${this.#updateHex}
						@blur=${() => this.requestUpdate()}
						${ref(this.#hexInputRef)}
					>
				</div>

				${["r", "g", "b"].map(k => html`
					<div>
						<label for=${`color-picker-fwl-${this.#id}-${k}`}>${k.toUpperCase()}</label>
						<input
							type="number"
							id=${`color-picker-fwl-${this.#id}-${k}`}
							min="0"
							max="255"
							step="1"
							.value=${Math.round(rgba[k])}
							@input=${e => this.#updateRgba(e, k)}
						>
					</div>
				`)}

				<div>
					<label for=${`color-picker-fwl-${this.#id}-a`}>A</label>
					<input
						type="number"
						id=${`color-picker-fwl-${this.#id}-a`}
						min="0"
						max="100"
						step="1"
						.value=${Math.round(hsva.a)}
						@input=${e => this.#updateHsva(e, "a")}
					>
				</div>
			</div>
		`;
	}

	/** @param {PointerEvent} e */
	#colorSpacePointerDown(e) {
		const { body } = document;
		e.target.focus();
		this.#updateFromColorSpaceEvent(e);

		body.addEventListener("pointermove", this.#updateFromColorSpaceEvent);
		body.addEventListener("pointerup", () => {
			body.removeEventListener("pointermove", this.#updateFromColorSpaceEvent);
			this.dispatchEvent(new Event("change", { bubbles: true, cancelable: false, composed: true }));
		}, { once: true });
	}

	/** @param {PointerEvent} e */
	#updateFromColorSpaceEvent = e => {
		if (!this.#colorSpaceAreaRef.value) return;

		e.preventDefault();
		e.stopImmediatePropagation();

		const { clientX, clientY } = e;
		const { left, top, width, height } = this.#colorSpaceAreaRef.value.getBoundingClientRect();
		const offsetX = Math.max(Math.min(clientX - left, width), 0);
		const offsetY = Math.max(Math.min(clientY - top, height), 0);

		const { h, a } = this._rawValue;
		const s = 100 * offsetX / width;
		const v = 100 * (1 - (offsetY / height));

		this.#setValue({ h, s, v, a });
	};

	/**
	 * @param {Event} e
	 * @param {keyof HSVA} key
	 */
	#updateHsva(e, key) {
		e.preventDefault();
		e.stopImmediatePropagation();

		this.#setValue({ ...this._rawValue, [key]: +e.currentTarget.value });
	}

	/**
	 * @param {Event} e
	 * @param {"r" | "g" | "b"} key
	 */
	#updateRgba(e, key) {
		e.preventDefault();
		e.stopImmediatePropagation();

		const rgba = hsvaToRgba(this._rawValue);
		this.#setValue({ ...rgba, [key]: +e.currentTarget.value });
	}

	/**
	 * @param {Event} e
	 */
	#updateHex(e) {
		const inputValue = e.currentTarget.value;
		const rgba = parseHexString(inputValue);
		if (rgba) this._rawValue = rgbaToHsva(rgba);
	}

	/**
	 * @param {string | RGBA | HSVA} value
	 * @param {Event} [e]
	 */
	#setValue(value, e) {
		e?.preventDefault();
		e?.stopImmediatePropagation();

		// Ensure value is in hsva format
		if (typeof value === "string") value = parseHexString(value);
		if ("r" in value) value = rgbaToHsva(value);

		this._rawValue = value;
		this.#internals.setFormValue(JSON.stringify(this.value));

		this.dispatchEvent(new Event("input", { bubbles: true, cancelable: false, composed: true }));
	}

	createRenderRoot() {
		return this;
	}
}

if (!customElements.get(elementName)) {
	customElements.define(elementName, ColorPickerElement);
}
