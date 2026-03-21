/** @import { TerrainShape } from "../geometry/terrain-shape.mjs" */
import { html } from "lit";
import { when } from "lit/directives/when.js";
import { getCssColorsFor, terrainTypeMap$ } from "../stores/terrain-types.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";
import { prettyFraction } from "../utils/misc-utils.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TerrainShapeChoiceDialog extends LitApplicationMixin(ApplicationV2) {

	static DEFAULT_OPTIONS = {
		tag: "form",
		window: {
			title: "TERRAINHEIGHTTOOLS.SelectAShape",
			contentClasses: ["terrain-shape-choice-dialog"]
		},
		form: {
			closeOnSubmit: false,
			handler: TerrainShapeChoiceDialog.#submitForm
		}
	};

	_terrainShapes;

	/** @type {((index: number) => void) | undefined} */
	#submitCallback;

	/** @param {TerrainShape[]} terrainShapes */
	constructor(terrainShapes, options = {}) {
		super(options);
		this._terrainShapes = this.#calculateShapeRenderData(terrainShapes);
	}

	/** @override */
	_renderHTML() {
		return html`
			${when(this.options.hint, () => html`
				<p class="terrain-shape-choice-hint-text">${l(this.options.hint)}</p>
			`)}

			<div class="terrain-shape-list">
				${this._terrainShapes.map(this.#renderShape)}
			</div>

			<footer class="form-footer">
				<button type="submit">
					<i class=${this.options.submitIcon}></i>
					<label>${l(this.options.submitLabel)}</label>
				</button>
			</footer>
		`;
	}

	/**
	 * @param {TerrainShapeChoiceDialog["_terrainShapes"][number]} data
	 * @param {number} idx
	 */
	#renderShape(data, idx) {
		return html`
			<label>
				<input class="terrain-shape-list-radio" type="radio" name="selectedTerrainShapeIndex" value=${idx}>
				<div class="terrain-shape-list-item flexcol">
					<p class="flex0" style="font-size: 0.875rem;">${data.terrainTypeName}</p>
					<p class="flex0" style="font-size: 0.8125rem;">
						${when(
							data.usesHeight,
							() => `${data.elevation} → ${data.top} (${l("Height")} ${data.height})`,
							() => html`&nbsp;`
						)}
					</p>
					<svg class="flex1" xmlns="http://www.w3.org/2000/svg" viewBox=${data.svgViewBox}>
						<path
							d=${data.svgPath}
							fill=${data.background}
							stroke=${data.borderColor}
							stroke-width=${data.borderWidth}
						/>
					</svg>
				</div>
			</label>
		`;
	}

	/** @param {import("../geometry/terrain-shape.mjs").TerrainShape[]} terrainShapes */
	#calculateShapeRenderData(terrainShapes) {
		const terrainTypeMap = terrainTypeMap$.value;

		return terrainShapes
			.map(shape => {
				const terrainType = terrainTypeMap.get(shape.terrainTypeId);
				const { path, viewBox } = shape.toSvg({ padding: terrainType.lineWidth });

				return {
					terrainTypeName: terrainType.name,
					usesHeight: !!terrainType.usesHeight,
					...getCssColorsFor(terrainType),
					height: prettyFraction(toSceneUnits(shape.height)),
					elevation: prettyFraction(toSceneUnits(shape.elevation)),
					top: prettyFraction(toSceneUnits(shape.height + shape.elevation)),
					svgPath: path,
					svgViewBox: viewBox,
					shape
				};
			})
			// sort by usesHeight (true first), then by top (highest first)
			.sort((a, b) =>
				b.usesHeight - a.usesHeight ||
				b.top - a.top);
	}

	/**
	 * @this {TerrainShapeChoiceDialog}
	 * @param {FormDataExtended} formData
	 */
	static async #submitForm(_event, _form, formData) {
		const selectedTerrainShapeIndex = +formData.object.selectedTerrainShapeIndex;
		if (isNaN(selectedTerrainShapeIndex)) return;

		this.#submitCallback?.(selectedTerrainShapeIndex);
		await this.close({ submit: false, force: true });
	}

	/**
	 * @param {import("../geometry/terrain-shape.mjs").TerrainShape[]} terrainShapes
	 * @param {Object} [options]
	 * @param {string} [options.hint] Hint message to show.
	 * @param {string} [options.submitLabel] Submit button label.
	 * @param {string} [options.submitIcon] Submit button icon.
	 * @returns {Promise<import("../geometry/terrain-shape.mjs").TerrainShape>}
	 */
	static show(terrainShapes, options) {
		return new Promise(resolve => {
			const app = new TerrainShapeChoiceDialog(terrainShapes, options);
			app.render(true);
			app.#submitCallback = selectedIndex => resolve(app._terrainShapes[selectedIndex].shape);
		});
	}
}
