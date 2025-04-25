import { moduleName } from "../consts.mjs";
import { paintingConfig$ } from "../stores/drawing.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { getCssColorsFor, getTerrainType, getTerrainTypes } from '../utils/terrain-types.mjs';
import { TerrainTypesConfig } from "./terrain-types-config.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TerrainPaintPalette extends withSubscriptions(HandlebarsApplicationMixin(ApplicationV2)) {

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
			height: 378,
		},
		actions: {
			configureTerrainTypes: TerrainPaintPalette.#configureTerrainTypes,
			selectTerrain: TerrainPaintPalette.#selectTerrain
		}
	};

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/terrain-paint-palette.hbs`,
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
		configureButton.dataset.action = "configureTerrainTypes";
		this.window.header.append(configureButton);

		return frame;
	}

	/** @override */
	async _prepareContext() {
		return {
			availableTerrains: getTerrainTypes().map(t => ({
				id: t.id,
				name: t.name,

				// Hex colors including opacity for preview boxes:
				...getCssColorsFor(t)
			}))
		};
	}

	/** @override */
	_onRender() {
		this._unsubscribeFromAll();
		this._subscriptions = [
			paintingConfig$.terrainTypeId$.subscribe(terrainTypeId => {
				// Highlight the selected terrain type
				this.element.querySelectorAll("[data-terrain-id].active").forEach(el => el.classList.remove("active"));
				this.element.querySelector(`[data-terrain-id='${terrainTypeId}']`)?.classList.add("active");

				// Enable/disable inputs based on whether this terrain type uses height
				const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;
				this.element.querySelectorAll("[name='selectedHeight'],[name='selectedElevation']").forEach(el => el.disabled = !usesHeight);
			}, true),

			// Update height input
			paintingConfig$.height$.subscribe(height =>
				this.element.querySelector("[name='selectedHeight']").value = toSceneUnits(height), true),

			// Update elevation input
			paintingConfig$.elevation$.subscribe(elevation =>
				this.element.querySelector("[name='selectedElevation']").value = toSceneUnits(elevation), true),

			// Update mode select
			paintingConfig$.mode$.subscribe(mode =>
				this.element.querySelector(`[name='mode'][value='${mode}']`).checked = true, true)
		];

		// On input change, update the relevant Signal
		this.element.querySelector("[name='selectedHeight']").addEventListener("input", evt =>
			paintingConfig$.height$.value = fromSceneUnits(this.#getInputValue(evt, 1)));

		this.element.querySelector("[name='selectedElevation']").addEventListener("input", evt =>
			paintingConfig$.elevation$.value = fromSceneUnits(this.#getInputValue(evt)));

		// On blur, set the value of the input to the Signal, so that if it was left as an invalid number it resets and shows the correct value again
		this.element.querySelector("[name='selectedHeight']").addEventListener("blur", evt =>
			evt.currentTarget.value = toSceneUnits(paintingConfig$.height$.value));

		this.element.querySelector("[name='selectedElevation']").addEventListener("blur", evt =>
			evt.currentTarget.value = toSceneUnits(paintingConfig$.elevation$.value));

		this.element.querySelectorAll("[name='mode']").forEach(el => el.addEventListener("change", evt =>
			paintingConfig$.mode$.value = evt.target.value));
	}

	/** @param {string} terrainId */
	#isHeightEnabledFor(terrainId) {
		return getTerrainType(terrainId).usesHeight;
	}

	/**
	 * @param {KeyboardEvent} event
	 * @param {number} min
	 */
	#getInputValue(event, min = 0) {
		const value = +event.currentTarget.value;
		return Math.max(isNaN(value) ? 0 : value, min);
	}

	/**
	 * @this {TerrainPaintPalette}
	 * @param {HTMLElement} target
	 */
	static #selectTerrain(_event, target) {
		const { terrainId } = target.dataset;
		const terrainType = getTerrainType(terrainId);

		target.closest("ul.terrain-type-palette").querySelectorAll("li.active").forEach(li => li.classList.remove("active"));
		target.closest("li").classList.add("active");
		this.element.querySelectorAll("[name='selectedHeight'],[name='selectedElevation']").forEach(el => el.disabled = !this.#isHeightEnabledFor(terrainId));

		paintingConfig$.value = {
			terrainTypeId: terrainId,
			height: terrainType.defaultHeight ?? paintingConfig$.height$.value,
			elevation: terrainType.defaultElevation ?? paintingConfig$.elevation$.value
		};
	}

	static #configureTerrainTypes() {
		new TerrainTypesConfig().render(true);
	}
}
