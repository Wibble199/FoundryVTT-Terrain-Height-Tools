import { html, LitElement } from "lit";
import { drawingModeTypes, moduleName } from "../../consts.mjs";
import { toolclip } from "../directives/toolclip.mjs";

/** @type {{ label: string; mode: drawingModeTypes; icon: string; visible?: () => boolean; toolclip?: ToolclipConfiguration; }[]} */
const drawingModes = [
	{
		mode: drawingModeTypes.gridCells,
		label: "CONTROLS.TerrainHeightToolsDrawingModeGridCells",
		icon: "fas fa-grid-5 fa-2x",
		toolclip: {
			heading: "CONTROLS.TerrainHeightToolsDrawingModeGridCells",
			src: `modules/${moduleName}/toolclips/drawingmode-cells.mp4`,
			items: [
				{ heading: "CONTROLS.CommonDraw", content: "CONTROLS.ClickOrClickDrag" },
				{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeP" }
			]
		},
		visible: () => canvas.grid?.type && canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS
	},
	{
		mode: drawingModeTypes.rectangle,
		label: "CONTROLS.TerrainHeightToolsDrawingModeRectangle",
		icon: "far fa-rectangle fa-2x",
		toolclip: {
			heading: "CONTROLS.TerrainHeightToolsDrawingModeRectangle",
			src: `modules/${moduleName}/toolclips/drawingmode-rect.mp4`,
			items: [
				{ heading: "CONTROLS.CommonDraw", reference: "CONTROLS.ClickDrag" },
				{ heading: "CONTROLS.CommonDrawProportional", reference: "CONTROLS.AltClickDrag" },
				{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeP" }
			]
		}
	},
	{
		mode: drawingModeTypes.ellipse,
		label: "CONTROLS.TerrainHeightToolsDrawingModeEllipse",
		icon: "far fa-circle fa-2x",
		toolclip: {
			heading: "CONTROLS.TerrainHeightToolsDrawingModeEllipse",
			src: `modules/${moduleName}/toolclips/drawingmode-ellipse.mp4`,
			items: [
				{ heading: "CONTROLS.CommonDraw", reference: "CONTROLS.ClickDrag" },
				{ heading: "CONTROLS.CommonDrawProportional", reference: "CONTROLS.AltClickDrag" },
				{ heading: "CONTROLS.TerrainHeightToolsDrawingModeEllipseDrawFromCenter", reference: "CONTROLS.CtrlClickDrag" },
				{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeP" }
			]
		}
	},
	{
		mode: drawingModeTypes.customPoly,
		label: "CONTROLS.TerrainHeightToolsDrawingModeCustomPolygon",
		icon: "far fa-draw-polygon fa-2x",
		toolclip: {
			heading: "CONTROLS.TerrainHeightToolsDrawingModeCustomPolygon",
			src: `modules/${moduleName}/toolclips/drawingmode-custom.mp4`,
			items: [
				{ heading: "CONTROLS.CommonDraw", content: "CONTROLS.TerrainHeightToolsDrawingModeCustomPolygonDraw" },
				{ heading: "CONTROLS.TerrainHeightToolsDrawingModeCustomPolygonRemoveLastPoint", reference: "CONTROLS.RightClick" },
				{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeP" }
			]
		}
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
						data-tooltip=${toolclip(drawingMode.toolclip, drawingMode.label)}
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
