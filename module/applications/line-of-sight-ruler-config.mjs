import { moduleName } from '../consts.mjs';
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

export class LineOfSightRulerConfig extends withSubscriptions(Application) {

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.LineOfSightConfigTitle"),
			id: "tht_lineOfSightRulerConfig",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/line-of-sight-config.hbs`,
			width: 200,
			height: 192
		});
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		/** @type {import("../layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer} */
		const rulerLayer = canvas.terrainHeightLosRulerLayer;

		this._unsubscribeFromAll();

		this._subscriptions = [
			rulerLayer._rulerStartHeight$.subscribe(v =>
				html.find("[name='rulerStartHeight']").val(v), true),

			rulerLayer._rulerEndHeight$.subscribe(v =>
				html.find("[name='rulerEndHeight']").val(v ?? ''), true),

			rulerLayer._rulerIncludeNoHeightTerrain$.subscribe(v =>
				html.find("[name='rulerIncludeNoHeightTerrain']").prop("checked", v), true)
		];

		// Start height
		html.find("[name='rulerStartHeight']").on("input", e => {
			const val = +e.target.value;
			if (!isNaN(val) && rulerLayer._rulerStartHeight$.value !== val)
				rulerLayer._rulerStartHeight$.value = val;
		});

		// End height
		html.find("[name='rulerEndHeight']").on("input", e => {
			// Allow leaving blank to inherit start height
			if (e.target.value === '' && rulerLayer._rulerEndHeight$.value !== undefined) {
				rulerLayer._rulerEndHeight$.value = undefined;
				return;
			}

			const val = +e.target.value;
			if (!isNaN(val) && rulerLayer._rulerEndHeight$.value !== val)
				rulerLayer._rulerEndHeight$.value = val;
		});

		// Include flat terrain
		html.find("[name='rulerIncludeNoHeightTerrain']").on("change", e => {
			rulerLayer._rulerIncludeNoHeightTerrain$.value = e.target.checked ?? false
		});
	}
}
