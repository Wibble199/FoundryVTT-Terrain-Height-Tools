import { moduleName } from "../consts.mjs";
import { paintingConfig$ } from "../stores/drawing.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { getCssColorsFor, getTerrainType, getTerrainTypes } from '../utils/terrain-types.mjs';
import { TerrainTypesConfig } from "./terrain-types-config.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

export class TerrainPaintPalette extends withSubscriptions(Application) {

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.PaletteTitle"),
			id: "tht_terrainPaintPalette",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/terrain-paint-palette.hbs`,
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
				...getCssColorsFor(t)
			}))
		};
	}

	/** @param {string} terrainId */
	#isHeightEnabledFor(terrainId) {
		return getTerrainType(terrainId).usesHeight;
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		this._unsubscribeFromAll();
		this._subscriptions = [
			paintingConfig$.terrainTypeId$.subscribe(terrainTypeId => {
				// Highlight the selected terrain type
				html.find("[data-terrain-id].active").removeClass("active");
				html.find(`[data-terrain-id='${terrainTypeId}']`).addClass("active");

				// Enable/disable inputs based on whether this terrain type uses height
				const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;
				html.find("[name='selectedHeight'],[name='selectedElevation']").prop("disabled", !usesHeight);
			}, true),

			// Update height input
			paintingConfig$.height$.subscribe(height =>
				html.find("[name='selectedHeight']").val(toSceneUnits(height)), true),

			// Update elevation input
			paintingConfig$.elevation$.subscribe(elevation =>
				html.find("[name='selectedElevation']").val(toSceneUnits(elevation)), true)
		];

		html.find("[data-terrain-id]").on("click", this.#onTerrainSelect.bind(this));

		html.find("[data-action='configure-terrain-types']").on("click", this.#configureTerrainTypes.bind(this));

		// On input change, update the relevant Signal
		html.find("[name='selectedHeight']").on("input", evt =>
			paintingConfig$.height$.value = fromSceneUnits(this.#getInputValue(evt)));

		html.find("[name='selectedElevation']").on("input", evt =>
			paintingConfig$.elevation$.value = fromSceneUnits(this.#getInputValue(evt)));

		// On blur, set the value of the input to the Signal, so that if it was left as an invalid number it resets and shows the correct value again
		html.find("[name='selectedHeight']").on("blur", evt =>
			evt.currentTarget.value = toSceneUnits(paintingConfig$.height$.value));

		html.find("[name='selectedElevation']").on("blur", evt =>
			evt.currentTarget.value = toSceneUnits(paintingConfig$.elevation$.value));
	}

	/** @param {MouseEvent} event */
	#onTerrainSelect(event) {
		const { terrainId } = event.currentTarget.dataset;
		event.currentTarget.closest("ul.terrain-type-palette").querySelectorAll("li.active").forEach(li => li.classList.remove("active"));
		event.currentTarget.closest("li").classList.add("active");
		this.element.find("[name='selectedHeight'],[name='selectedElevation']").prop("disabled", !this.#isHeightEnabledFor(terrainId));

		paintingConfig$.terrainTypeId$.value = terrainId;
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
