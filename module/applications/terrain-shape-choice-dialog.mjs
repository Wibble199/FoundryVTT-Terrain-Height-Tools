import { moduleName } from "../consts.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";
import { prettyFraction } from "../utils/misc-utils.mjs";
import { getCssColorsFor, getTerrainTypeMap } from "../utils/terrain-types.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TerrainShapeChoiceDialog extends HandlebarsApplicationMixin(ApplicationV2) {

	#terrainShapes;

	/** @type {((index: number) => void) | undefined} */
	#submitCallback;

	/** @param {import("../geometry/height-map-shape.mjs").HeightMapShape[]} terrainShapes */
	constructor(terrainShapes, options = {}) {
		super(options);
		this.#terrainShapes = this.#calculateShapeRenderData(terrainShapes);
	}

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

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/terrain-shape-choice-dialog.hbs`
		},
		footer: {
			template: "templates/generic/form-footer.hbs"
		}
	};

	/** @override */
	async _prepareContext() {
		return {
			shapes: this.#terrainShapes,
			options: this.options,
			buttons: [
				{
					type: "submit",
					label: this.options.submitLabel,
					icon: this.options.submitIcon
				}
			]
		};
	}

	/** @param {import("../geometry/height-map-shape.mjs").HeightMapShape[]} terrainShapes */
	#calculateShapeRenderData(terrainShapes) {
		const terrainTypeMap = getTerrainTypeMap();

		return terrainShapes
			.map(shape => {
				const terrainType = terrainTypeMap.get(shape.terrainTypeId);
				const { boundingBox: bb, vertices } = shape.polygon;
				const svgPadding = terrainType.lineWidth;

				return {
					terrainTypeName: terrainType.name,
					usesHeight: terrainType.usesHeight,
					...getCssColorsFor(terrainType),
					height: prettyFraction(toSceneUnits(shape.height)),
					elevation: prettyFraction(toSceneUnits(shape.elevation)),
					top: prettyFraction(toSceneUnits(shape.height + shape.elevation)),
					svgPath: `${vertices.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join("")}Z`,
					svgViewBox: `${bb.x1 - svgPadding} ${bb.y1 - svgPadding} ${bb.w + svgPadding * 2} ${bb.h + svgPadding * 2}`,
					original: shape
				}
			})
			// sort by usesHeight (true first), then by elevation (highest first)
			.sort((a, b) =>
				b.usesHeight - a.usesHeight ||
				b.elevation - a.elevation
			);
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
	 * @param {import("../geometry/height-map-shape.mjs").HeightMapShape[]} terrainShapes
	 * @param {Object} [options]
	 * @param {string} [options.hint] Hint message to show.
	 * @param {string} [options.submitLabel] Submit button label.
	 * @param {string} [options.submitIcon] Submit button icon.
	 * @returns {Promise<import("../geometry/height-map-shape.mjs").HeightMapShape>}
	 */
	static show(terrainShapes, options) {
		return new Promise(resolve => {
			const app = new TerrainShapeChoiceDialog(terrainShapes, options);
			app.render(true);
			app.#submitCallback = selectedIndex => resolve(app.#terrainShapes[selectedIndex].original);
		});
	}
}
