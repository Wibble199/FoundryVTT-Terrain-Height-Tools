import { moduleName } from "../consts.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";
import { prettyFraction } from "../utils/misc-utils.mjs";
import { getCssColorsFor, getTerrainTypeMap } from "../utils/terrain-types.mjs";

export class TerrainShapeChoiceDialog extends FormApplication {

	#terrainShapes;

	/** @type {((index: number) => void) | undefined} */
	#updateCallback;

	/** @param {import("../geometry/height-map-shape.mjs").HeightMapShape[]} terrainShapes */
	constructor(terrainShapes, options = {}) {
		super({}, options);
		this.#terrainShapes = this.#calculateShapeRenderData(terrainShapes);
	}

	/** @override */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.SelectAShape"),
			template: `modules/${moduleName}/templates/terrain-shape-choice-dialog.hbs`,
			classes: [...(super.defaultOptions.classes ?? []), "terrain-shape-choice-dialog"],
			closeOnSubmit: false
		});
	}

	/** @override */
	getData() {
		return {
			shapes: this.#terrainShapes,
			options: this.options
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

	/** @override */
	async _updateObject(_, formData) {
		const selectedTerrainShapeIndex = +formData.selectedTerrainShapeIndex;
		if (isNaN(selectedTerrainShapeIndex)) return;

		this.#updateCallback?.(selectedTerrainShapeIndex);
		await this.close({ submit: false, force: true });
	}

	/**
	 * @param {import("../geometry/height-map-shape.mjs").HeightMapShape[]} terrainShapes
	 * @param {Object} [options]
	 * @param {string} [options.hint] Hint message to show.
	 * @param {string} [options.submitLabel] Submit button label.
	 * @returns {Promise<import("../geometry/height-map-shape.mjs").HeightMapShape>}
	 */
	static show(terrainShapes, options) {
		return new Promise(resolve => {
			const app = new TerrainShapeChoiceDialog(terrainShapes, options);
			app.render(true);
			app.#updateCallback = selectedIndex => resolve(app.#terrainShapes[selectedIndex].original);
		});
	}
}
