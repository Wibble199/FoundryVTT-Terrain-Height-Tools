import { moduleName } from '../consts.mjs';

export class LineOfSightRulerConfig extends Application {

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.LineOfSightConfigTitle"),
			id: "tht_lineOfSightRulerConfig",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/line-of-sight-config.hbs`,
			width: 200,
			height: 192,
			resizable: true
		});
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		/** @type {import("../layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer} */
		const rulerLayer = canvas.terrainHeightLosRulerLayer;

		// Start height
		rulerLayer._rulerStartHeight.subscribe(v => html.find("[name='rulerStartHeight']").val(v), true);
		html.find("[name='rulerStartHeight']").on("input", e => {
			const val = +e.target.value;
			if (!isNaN(val) && rulerLayer._rulerStartHeight.value !== val)
				rulerLayer._rulerStartHeight.value = val;
		});

		// End height
		rulerLayer._rulerEndHeight.subscribe(v => html.find("[name='rulerEndHeight']").val(v ?? ''), true);
		html.find("[name='rulerEndHeight']").on("input", e => {
			// Allow leaving blank to inherit start height
			if (e.target.value === '' && rulerLayer._rulerEndHeight.value !== undefined) {
				rulerLayer._rulerEndHeight.value = undefined;
				return;
			}

			const val = +e.target.value;
			if (!isNaN(val) && rulerLayer._rulerEndHeight.value !== val)
				rulerLayer._rulerEndHeight.value = val;
		});

		// Include flat terrain
		rulerLayer._rulerIncludeNoHeightTerrain.subscribe(v => html.find("[name='rulerIncludeNoHeightTerrain']").prop("checked", v), true);
		html.find("[name='rulerIncludeNoHeightTerrain']").on("change", e => {
			rulerLayer._rulerIncludeNoHeightTerrain.value = e.target.checked ?? false
		});
	}

	/**
	 * Updates the vertical slice on the UI with new line of sight data.
	 * @param {number} h1 The start height of the test line.
	 * @param {number} h2 The end height of the test line.
	 */
	_updateLineOfSightData(h1, h2) {
		this.h1 = h1;
		this.h2 = h2;
		this.render(false);
	}
}
