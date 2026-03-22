import { html, LitElement } from "lit";
import { drawingModeTypes } from "../consts.mjs";

/** @type {{ label: string; mode: drawingModeTypes; icon: string; visible?: () => boolean; }[]} */
const drawingModes = [
	{
		label: "Grid",
		icon: "fas fa-grid-5 fa-2x",
		mode: drawingModeTypes.gridCells,
		visible: () => canvas.grid?.type && canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS
	},
	{
		label: "Rectangle",
		icon: "far fa-rectangle fa-2x",
		mode: drawingModeTypes.rectangle
	},
	{
		label: "Ellipse",
		icon: "far fa-circle fa-2x",
		mode: drawingModeTypes.ellipse
	},
	{
		label: "Custom",
		icon: "far fa-draw-polygon fa-2x",
		mode: drawingModeTypes.customPoly
	}
];

class DrawingModePickerElement extends LitElement {

	static properties = {
		value: { type: String },
		id: { type: String }
	};

	static formAssociated = true;

	#internals;

	constructor() {
		super();

		this.#internals = this.attachInternals();

		this.value = "";
		this.id = "drawingModePicker";
	}

	render() {
		return html`
			<div class="tht-form-group flexrow max-content-width margin-x-auto">
				${drawingModes.filter(({ visible }) => visible?.() ?? true).map(drawingMode => html`
					<div
						class="tht-radio-button"
						data-tooltip=${game.i18n.localize(drawingMode.label)}
					>
						<input
							id=${`${this.id}_drawingMode_${drawingMode.mode}`}
							type="radio"
							name=${`${this.id}_drawingMode`}
							value=${drawingMode.mode}
							?checked=${this.value === drawingMode.mode}
							@change=${e => this.#setValue(e, drawingMode.mode)}
						>
						<label for=${`${this.id}_drawingMode_${drawingMode.mode}`}>
							<i class=${drawingMode.icon}></i>
						</label>
					</div>
				`)}
			</div>
		`;
	}

	/**
	 * @param {Event} e
	 * @param {drawingModeTypes} value
	 */
	#setValue(e, value) {
		e.preventDefault();
		e.stopImmediatePropagation();

		this.value = value;
		this.#internals.setFormValue(value);

		this.dispatchEvent(new Event("input", { bubbles: true, cancelable: false, composed: true }));
	}

	createRenderRoot() {
		return this;
	}
}

customElements.define("tht-drawing-mode-picker", DrawingModePickerElement);
