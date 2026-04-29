import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { when } from "lit/directives/when.js";
import { terrainPaintMode, tools } from "../consts.mjs";
import { drawingMode$, paintingConfig$ } from "../stores/drawing.mjs";
import { getCssColorsFor, getTerrainType, terrainTypes$ } from "../stores/terrain-types.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { abortableSubscribe } from "../utils/signal-utils.mjs";
import "./components/drawing-mode-picker.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtApplicationPositionMixin } from "./mixins/tht-application-position-mixin.mjs";
import { TerrainTypesConfig } from "./terrain-types-config.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TerrainPaintPalette extends ThtApplicationPositionMixin(LitApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainPaintPalette",
		window: {
			title: "TERRAINHEIGHTTOOLS.PaletteTitle",
			icon: "fas fa-paintbrush",
			contentClasses: ["terrain-height-tool-window"],
			resizable: true,
			minimizable: false
		},
		position: {
			width: 220,
			height: 434
		}
	};

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);

		// Remove close button
		this.window.close.remove();

		// Add configure terrain types button
		const configureButton = document.createElement("button");
		configureButton.classList.add("header-control", "fas", "fa-cog");
		configureButton.addEventListener("click", TerrainPaintPalette.#configureTerrainTypes);
		this.window.header.append(configureButton);

		return frame;
	}

	/** @override */
	_renderHTML() {
		const selectedTerrainType$ = computed(() => paintingConfig$.terrainTypeId.value
			? getTerrainType(paintingConfig$.terrainTypeId.value)
			: undefined);

		return html`
			${when(game.activeTool !== tools.fill, () => html`
				<tht-drawing-mode-picker
					.value=${drawingMode$}
					@input=${e => drawingMode$.value = e.target.value}
				></tht-drawing-mode-picker>

				<hr/>
			`)}

			<ul class="terrain-type-palette">
				${when(
					terrainTypes$.value.length,
					() => terrainTypes$.value.map(terrainType => {
						const { borderColor, background } = getCssColorsFor(terrainType);
						return html`
							<li
								class=${computed(() => classMap({ active: paintingConfig$.terrainTypeId.value === terrainType.id }))}
								@click=${() => paintingConfig$.value = {
									terrainTypeId: terrainType.id,
									height: terrainType.defaultHeight ?? paintingConfig$.height.value,
									elevation: terrainType.defaultElevation ?? paintingConfig$.elevation.value
								}}
							>
								<div class="preview-box" style=${styleMap({ borderColor, background })}></div>
								<label class="terrain-type-name">${terrainType.name}</label>
							</li>
						`;
					}),
					() => html`<li>
						<a @click=${TerrainPaintPalette.#configureTerrainTypes}>
							${l("TERRAINHEIGHTTOOLS.NoTerrainTypesWarn")}
						</a>
					</li>`
				)}
			</ul>

			<hr/>

			<div class="flex0">
				<div class="tht-form-group flexrow">
					<label>
						${l("TERRAINHEIGHTTOOLS.Height.Name")}
						<i
							class="fa fa-question-circle tht-form-group-hint"
							data-tooltip=${l("TERRAINHEIGHTTOOLS.Height.Hint")}
						></i>
					</label>
					<input
						type="number"
						name="selectedHeight"
						min="1"
						.value=${computed(() => toSceneUnits(paintingConfig$.height.value))}
						?disabled=${computed(() => !selectedTerrainType$.value?.usesHeight)}
						@change=${e => paintingConfig$.height.value = fromSceneUnits(this.#getInputValue(e, 0.1))}
						@blur=${e => e.target.value = toSceneUnits(paintingConfig$.height.value)}
					>
				</div>
				<div class="tht-form-group flexrow">
					<label>
						${l("TERRAINHEIGHTTOOLS.Elevation.Name")}
						<i
							class="fa fa-question-circle tht-form-group-hint"
							data-tooltip=${l("TERRAINHEIGHTTOOLS.Elevation.Hint")}
						></i>
					</label>
					<input
						type="number"
						name="selectedElevation"
						min="0"
						.value=${computed(() => toSceneUnits(paintingConfig$.elevation.value))}
						?disabled=${computed(() => !selectedTerrainType$.value?.usesHeight)}
						@change=${e => paintingConfig$.elevation.value = fromSceneUnits(this.#getInputValue(e))}
						@blur=${e => e.target.value = toSceneUnits(paintingConfig$.elevation.value)}
					>
				</div>

				<div class="tht-form-group flexrow max-content-width margin-x-auto">
					${Object.keys(terrainPaintMode).map(mode => {
						const modePascal = mode[0].toUpperCase() + mode.substring(1);
						return html`
							<div
								class="tht-radio-button"
								data-tooltip=${l(`TERRAINHEIGHTTOOLS.PaintMode.${modePascal}.Hint`)}
							>
								<input
									id=${`tht_terrainPaintPalette_mode_${mode}`}
									type="radio"
									name="mode"
									value=${mode}
									.checked=${computed(() => paintingConfig$.mode.value === mode)}
									@change=${() => paintingConfig$.mode.value = mode}
								>
								<label for=${`tht_terrainPaintPalette_mode_${mode}`}>
									${l(`TERRAINHEIGHTTOOLS.PaintMode.${modePascal}.Name`)}
								</label>
							</div>
						`;
					})}
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
	 * @param {KeyboardEvent} event
	 * @param {number} min
	 */
	#getInputValue(event, min = 0) {
		const value = +event.currentTarget.value;
		return Math.max(isNaN(value) ? 0 : value, min);
	}

	static #configureTerrainTypes() {
		new TerrainTypesConfig().render(true);
	}
}
