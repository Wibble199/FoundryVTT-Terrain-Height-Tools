import { moduleName } from '../consts.mjs';
import { includeNoHeightTerrain$, lineOfSightRulerConfig$ } from "../stores/line-of-sight.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LineOfSightRulerConfig extends withSubscriptions(HandlebarsApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_lineOfSightRulerConfig",
		window: {
			title: "TERRAINHEIGHTTOOLS.LineOfSightConfigTitle",
			icon: "fas fa-ruler-combined",
			contentClasses: ["terrain-height-tool-window"]
		},
		position: {
			width: 200
		}
	};

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/line-of-sight-config.hbs`,
		}
	};

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_onRender() {
		this._unsubscribeFromAll();

		this._subscriptions = [
			lineOfSightRulerConfig$.h1$.subscribe(v =>
				this.element.querySelector("[name='rulerStartHeight']").value = toSceneUnits(v), true),

			lineOfSightRulerConfig$.h2$.subscribe(v =>
				this.element.querySelector("[name='rulerEndHeight']").value = v !== undefined ? toSceneUnits(v) : '', true),

			includeNoHeightTerrain$.subscribe(v =>
				this.element.querySelector("[name='rulerIncludeNoHeightTerrain']").checked = v, true)
		];

		// Start height
		this.element.querySelector("[name='rulerStartHeight']").addEventListener("input", e => {
			const val = fromSceneUnits(+e.target.value);
			if (!isNaN(val) && lineOfSightRulerConfig$.h1$.value !== val)
				lineOfSightRulerConfig$.h1$.value = val;
		});

		// End height
		this.element.querySelector("[name='rulerEndHeight']").addEventListener("input", e => {
			// Allow leaving blank to inherit start height
			if (e.target.value === '' && lineOfSightRulerConfig$.h2$.value !== undefined) {
				lineOfSightRulerConfig$.h2$.value = undefined;
				return;
			}

			const val = fromSceneUnits(+e.target.value);
			if (!isNaN(val) && lineOfSightRulerConfig$.h2$.value !== val)
				lineOfSightRulerConfig$.h2$.value = val;
		});

		// Include flat terrain
		this.element.querySelector("[name='rulerIncludeNoHeightTerrain']").addEventListener("change", e => {
			includeNoHeightTerrain$.value = e.target.checked ?? false
		});
	}
}
