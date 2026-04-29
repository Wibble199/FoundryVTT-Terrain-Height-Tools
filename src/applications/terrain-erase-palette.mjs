import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { drawingMode$, eraseConfig$ } from "../stores/drawing.mjs";
import { getCssColorsFor, terrainTypes$ } from "../stores/terrain-types.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { abortableSubscribe } from "../utils/signal-utils.mjs";
import "./components/drawing-mode-picker.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtApplicationPositionMixin } from "./mixins/tht-application-position-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TerrainErasePalette extends ThtApplicationPositionMixin(LitApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainErasePalette",
		window: {
			title: "TERRAINHEIGHTTOOLS.PaletteTitle",
			icon: "fas fa-eraser",
			contentClasses: ["terrain-height-tool-window"],
			resizable: true,
			minimizable: false
		},
		position: {
			width: 220,
			height: 441
		}
	};

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_renderHTML() {
		return html`
			<tht-drawing-mode-picker
				.value=${drawingMode$}
				@input=${e => drawingMode$.value = e.target.value}
			></tht-drawing-mode-picker>

			<hr/>

			<p class="flex0" style="margin-top: 0;">${l("TERRAINHEIGHTTOOLS.TerrainTypesToErase")}</p>
			<ul class="terrain-type-palette">
				${terrainTypes$.value.map(terrainType => {
					const { borderColor, background } = getCssColorsFor(terrainType);
					return html`
						<li
							class=${computed(() => classMap({ active: !eraseConfig$.excludedTerrainTypeIds.value.includes(terrainType.id) }))}
							@click=${() => this.#selectTerrain(terrainType.id)}
						>
							<div class="preview-box" style=${styleMap({ borderColor, background })}></div>
							<label class="terrain-type-name">${terrainType.name}</label>
						</li>
					`;
				})}
			</ul>

			<div class="flex0" style="text-align: right;">
				<a data-tooltip=${l("SelectAll")} @click=${TerrainErasePalette.#selectAll}>
					<i class="fas fa-circle"></i>
				</a>
				<a data-tooltip=${l("SelectNone")} @click=${TerrainErasePalette.#selectNone}>
					<i class="far fa-circle"></i>
				</a>
				<a data-tooltip=${l("InvertSelection")} @click=${TerrainErasePalette.#selectInverse}>
					<i class="fas fa-circle-half-stroke"></i>
				</a>
			</div>

			<hr/>

			<div class="flex0">
				<div class="tht-form-group flexrow">
					<label class="flex1">
						${l("TERRAINHEIGHTTOOLS.Top")}
						<i class="fa fa-question-circle tht-form-group-hint" data-tooltip=${l("TERRAINHEIGHTTOOLS.EraseTop.Hint")}></i>
					</label>
					<input
						type="number"
						class="flex1 erase-range-input"
						name="top"
						placeholder="+ &#xf534;"
						.min=${computed(() => toSceneUnits(eraseConfig$.bottom.value))}
						.value=${computed(() => toSceneUnits(eraseConfig$.top.value))}
						@input=${e => eraseConfig$.top.value = fromSceneUnits(this.#getInputValue(e))}
						@blur=${TerrainErasePalette.#onTopBlur}
					>
				</div>

				<div class="tht-form-group flexrow">
					<label class="flex1">
						${l("TERRAINHEIGHTTOOLS.Bottom")}
						<i class="fa fa-question-circle tht-form-group-hint" data-tooltip=${l("TERRAINHEIGHTTOOLS.EraseBottom.Hint")}></i>
					</label>
					<input
						type="number"
						class="flex1 erase-range-input"
						name="bottom"
						min="0"
						placeholder="- &#xf534;"
						.max=${computed(() => toSceneUnits(eraseConfig$.top.value))}
						.value=${computed(() => toSceneUnits(eraseConfig$.bottom.value))}
						@input=${e => eraseConfig$.bottom.value = fromSceneUnits(this.#getInputValue(e))}
						@blur=${TerrainErasePalette.#onBottomBlur}
					>
				</div>
			</div>
		`;
	}

	/** @override */
	_onFirstRender(...args) {
		super._onFirstRender(...args);
		abortableSubscribe(terrainTypes$, () => this.render(), this.closeSignal);
	}

	/**
	 * @param {string} terrainTypeId
	 */
	#selectTerrain(terrainTypeId) {
		const excludedTerrainTypeIds = eraseConfig$.excludedTerrainTypeIds.value;

		eraseConfig$.excludedTerrainTypeIds.value = excludedTerrainTypeIds.includes(terrainTypeId)
			? excludedTerrainTypeIds.filter(id => id !== terrainTypeId)
			: [...excludedTerrainTypeIds, terrainTypeId];
	}

	static #selectAll() {
		eraseConfig$.excludedTerrainTypeIds.value = [];
	}

	static #selectNone() {
		eraseConfig$.excludedTerrainTypeIds.value = terrainTypes$.value.map(t => t.id);
	}

	static #selectInverse() {
		const currentlySelected = new Set(eraseConfig$.excludedTerrainTypeIds.value);
		const allTerrainTypes = terrainTypes$.value.map(t => t.id);
		eraseConfig$.excludedTerrainTypeIds.value = allTerrainTypes.filter(t => !currentlySelected.has(t));
	}

	/**
	 * @param {KeyboardEvent} event
	 * @param {number} min
	 */
	#getInputValue(event) {
		if (["", null, undefined].includes(event.currentTarget.value)) return null;
		const value = +event.currentTarget.value;
		return Math.max(isNaN(value) ? 0 : value, 0);
	}

	/** @param {InputEvent} evt */
	static #onTopBlur(evt) {
		// On blur, ensure that the value is below/above the other value and then set the value of the input to the
		// Signal, so that if it was left as an invalid number it resets and shows the correct value again.
		let { bottom, top } = eraseConfig$.value;
		if (typeof bottom === "number" && typeof top === "number" && top < bottom)
			top = eraseConfig$.top.value = bottom;

		evt.target.value = toSceneUnits(top);
	}

	/** @param {InputEvent} evt */
	static #onBottomBlur(evt) {
		// On blur, ensure that the value is below/above the other value and then set the value of the input to the
		// Signal, so that if it was left as an invalid number it resets and shows the correct value again.
		let { bottom, top } = eraseConfig$.value;
		if (typeof bottom === "number" && typeof top === "number" && bottom > top)
			bottom = eraseConfig$.bottom.value = top;

		evt.target.value = toSceneUnits(bottom);
	}
}
