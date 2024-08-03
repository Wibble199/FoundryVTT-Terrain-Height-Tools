import { layers, moduleName, settings } from "../consts.mjs";
import { Signal } from "../utils/reactive.mjs";
import { getTerrainType, getTerrainTypes } from '../utils/terrain-types.mjs';
import { TerrainTypesConfig } from "./terrain-types-config.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

export class TerrainHeightPalette extends withSubscriptions(Application) {

	constructor() {
		super();

		/** @type {string | undefined} */
		this.selectedTerrainId = undefined;
		this._selectedHeight = 1;
		this._selectedElevation = 0;
	}

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.PaletteTitle"),
			id: "tht_terrainHeightPalette",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/terrain-height-palette.hbs`,
			scrollY: ["ul"],
			width: 220,
			height: 342,
			resizable: true
		});
	}

	/** @override */
	_getHeaderButtons() {
		return [
			{
				label: "",
				icon: "fas fa-cog",
				class: "configure",
				onclick: () => this.#configureTerrainTypes()
			}
		];
	}

	/** @override */
	getData() {
		return {
			availableTerrains: getTerrainTypes().map(t => ({
				id: t.id,
				name: t.name,

				// Hex colors including opacity for preview boxes:
				previewBorderColor: t.lineWidth <= 0
					? "transparent"
					: t.lineColor + Math.round(t.lineOpacity * 255).toString(16).padStart(2, "0"),
				previewBackgroundColor: t.fillColor + Math.round(t.fillOpacity * 255).toString(16).padStart(2, "0"),
			}))
		};
	}

	/** @param {string} terrainId */
	isHeightEnabledFor(terrainId) {
		return getTerrainType(terrainId).usesHeight;
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		/** @type {import("../layers/height-map-editor-layer.mjs").HeightMapEditorLayer} */
		const layer = canvas[layers.heightMapEditor];

		this._unsubscribeFromAll();
		this._subscriptions = [
			layer._selectedPaintingTerrainTypeId$.subscribe(terrainTypeId => {
				// Highlight the selected terrain type
				html.find("[data-terrain-id].active").removeClass("active");
				html.find(`[data-terrain-id='${terrainTypeId}']`).addClass("active");

				// Enable/disable inputs based on whether this terrain type uses height
				const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;
				html.find(".height-input input").prop("disabled", !usesHeight);
			}, true),

			// Update height input
			layer._selectedPaintingHeight$.subscribe(height =>
				html.find("[name='selectedHeight']").val(height), true),

			// Update elevation input
			layer._selectedPaintingElevation$.subscribe(elevation =>
				html.find("[name='selectedElevation']").val(elevation), true),

			// Redraw if the terrain types setting changes
			Signal.fromSetting(moduleName, settings.terrainTypes).subscribe(() =>
				this.render(false))
		];

		html.find("[data-terrain-id]").on("click", this.#onTerrainSelect.bind(this));

		html.find("[data-action='configure-terrain-types']").on("click", this.#configureTerrainTypes.bind(this));

		// On input change, update the relevant Signal
		html.find("[name='selectedHeight']").on("input", evt =>
			layer._selectedPaintingHeight$.value = this.#getInputValue(evt));

		html.find("[name='selectedElevation']").on("input", evt =>
			layer._selectedPaintingElevation$.value = this.#getInputValue(evt));

		// On blur, set the value of the input to the Signal, so that if it was left as an invalid number it resets and shows the correct value again
		html.find("[name='selectedHeight']").on("blur", evt =>
			evt.currentTarget.value = layer._selectedPaintingHeight$.value);

		html.find("[name='selectedElevation']").on("blur", evt =>
			evt.currentTarget.value = layer._selectedPaintingElevation$.value);
	}

	#onTerrainSelect(event) {
		const { terrainId } = event.currentTarget.dataset;
		event.currentTarget.closest("ul").querySelectorAll("li.active").forEach(li => li.classList.remove("active"));
		event.currentTarget.closest("li").classList.add("active");
		this.element.find("[name='selectedHeight'],[name='selectedElevation']").prop("disabled", !this.isHeightEnabledFor(terrainId));

		/** @type {import("../layers/height-map-editor-layer.mjs").HeightMapEditorLayer} */
		const layer = canvas[layers.heightMapEditor];
		layer._selectedPaintingTerrainTypeId$.value = terrainId;
	}

	/**
	 * @param {KeyboardEvent} event
	 * @param {number} min
	 */
	#getInputValue(event) {
		const value = +event.currentTarget.value;
		return Math.max(isNaN(value) ? 0 : value, 0);
	}

	#configureTerrainTypes() {
		new TerrainTypesConfig().render(true);
	}
}
