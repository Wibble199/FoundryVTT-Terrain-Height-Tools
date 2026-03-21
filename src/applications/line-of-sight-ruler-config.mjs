import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { when } from "lit/directives/when.js";
import { includeNoHeightTerrain$, lineOfSightRulerConfig$ } from "../stores/line-of-sight.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtApplicationPositionMixin } from "./mixins/tht-application-position-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class LineOfSightRulerConfig extends ThtApplicationPositionMixin(LitApplicationMixin(ApplicationV2)) {

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

	/** @type {LineOfSightRulerConfig | undefined} */
	static current;

	constructor(...args) {
		super(...args);
		LineOfSightRulerConfig.current = this;
	}

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_renderHTML() {
		return html`
			<div class="form-group-stacked">
				<label>
					${l("TERRAINHEIGHTTOOLS.StartHeight.Name")}:
					<i
						class="fa fa-question-circle height-input-hint"
						data-tooltip=${l("TERRAINHEIGHTTOOLS.StartHeight.Hint")}
					></i>
				</label>
				<div class="flexrow gap-05rem">
					<input
						type="number"
						name="rulerStartHeight"
						.value=${computed(() => toSceneUnits(lineOfSightRulerConfig$.h1.value))}
						min="0"
						@input=${this.#onStartHeightInput}
					>
					${when(canvas.scene.grid.units, () => html`<span class="flex0">${canvas.scene.grid.units}</span>`)}
				</div>
			</div>

			<div class="form-group-stacked">
				<label>
					${l("TERRAINHEIGHTTOOLS.EndHeight.Name")}:
					<i
						class="fa fa-question-circle height-input-hint"
						data-tooltip=${l("TERRAINHEIGHTTOOLS.EndHeight.Hint")}
					></i>
				</label>
				<div class="flexrow gap-05rem">
					<input
						type="number"
						name="rulerEndHeight"
						.value=${computed(() => {
							const h2 = lineOfSightRulerConfig$.h2.value;
							return h2 ? toSceneUnits(h2) : "";
						})}
						min="0"
						placeholder=${l("TERRAINHEIGHTTOOLS.SameAsStart")}
						@input=${this.#onEndHeightInput}
					>
					${when(canvas.scene.grid.units, () => html`<span class="flex0">${canvas.scene.grid.units}</span>`)}
				</div>
			</div>

			<label>
				<input
					type="checkbox"
					name="rulerIncludeNoHeightTerrain"
					.checked=${includeNoHeightTerrain$}
					@change=${this.#onIncludeNoHeightTerrainChange}
				>
				${l("TERRAINHEIGHTTOOLS.IncludeZones")}
			</label>
		`;
	}

	/** @param {InputEvent} e */
	#onStartHeightInput(e) {
		const val = fromSceneUnits(+e.target.value);
		if (!isNaN(val) && lineOfSightRulerConfig$.h1.value !== val)
			lineOfSightRulerConfig$.h1.value = val;
	}

	/** @param {InputEvent} e */
	#onEndHeightInput(e) {
		// Allow leaving blank to inherit start height
		if (e.target.value === "") {
			lineOfSightRulerConfig$.h2.value = undefined;
			return;
		}

		const val = fromSceneUnits(+e.target.value);
		if (!isNaN(val) && lineOfSightRulerConfig$.h2.value !== val)
			lineOfSightRulerConfig$.h2.value = val;
	}

	/** @param {InputEvent} e */
	#onIncludeNoHeightTerrainChange(e) {
		includeNoHeightTerrain$.value = e.target.checked;
	}
}
