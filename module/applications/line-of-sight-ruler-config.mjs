import { moduleName } from '../consts.mjs';
import { includeNoHeightTerrain$, lineOfSightRulerConfig$ } from "../stores/line-of-sight.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

export class LineOfSightRulerConfig extends withSubscriptions(Application) {

	/** @override */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
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

		this._unsubscribeFromAll();

		this._subscriptions = [
			lineOfSightRulerConfig$.h1$.subscribe(v =>
				html.find("[name='rulerStartHeight']").val(toSceneUnits(v)), true),

			lineOfSightRulerConfig$.h2$.subscribe(v =>
				html.find("[name='rulerEndHeight']").val(v !== undefined ? toSceneUnits(v) : ''), true),

			includeNoHeightTerrain$.subscribe(v =>
				html.find("[name='rulerIncludeNoHeightTerrain']").prop("checked", v), true)
		];

		// Start height
		html.find("[name='rulerStartHeight']").on("input", e => {
			const val = fromSceneUnits(+e.target.value);
			if (!isNaN(val) && lineOfSightRulerConfig$.h1$.value !== val)
				lineOfSightRulerConfig$.h1$.value = val;
		});

		// End height
		html.find("[name='rulerEndHeight']").on("input", e => {
			// Allow leaving blank to inherit start height
			if (e.target.value === '' && lineOfSightRulerConfig$.h2$.value !== undefined) {
				lineOfSightRulerConfig$.h2.value = undefined;
				return;
			}

			const val = fromSceneUnits(+e.target.value);
			if (!isNaN(val) && lineOfSightRulerConfig$.h2$.value !== val)
				lineOfSightRulerConfig$.h2$.value = val;
		});

		// Include flat terrain
		html.find("[name='rulerIncludeNoHeightTerrain']").on("change", e => {
			includeNoHeightTerrain$.value = e.target.checked ?? false
		});
	}
}
