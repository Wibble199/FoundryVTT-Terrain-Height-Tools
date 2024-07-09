import { moduleName } from "../consts.mjs";
import { getTerrainType, getTerrainTypes } from '../utils/terrain-types.mjs';
import { TerrainTypesConfig } from "./terrain-types-config.mjs";

export class TerrainHeightPalette extends Application {

	constructor() {
		super();

		/** @type {string | undefined} */
		this.selectedTerrainId = undefined;
		this._selectedHeight = 1;
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

	get selectedHeight() {
		return getTerrainType(this.selectedTerrainId)?.usesHeight
			? this._selectedHeight
			: 0;
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
		const availableTerrains = getTerrainTypes();

		return {
			availableTerrains: availableTerrains.map(t => ({
				...t,

				// Hex colors including opacity for preview boxes:
				previewBorderColor: t.lineWidth <= 0
					? "transparent"
					: t.lineColor + Math.round(t.lineOpacity * 255).toString(16).padStart(2, "0"),
				previewBackgroundColor: t.fillColor + Math.round(t.fillOpacity * 255).toString(16).padStart(2, "0"),
			})),
			selectedTerrainId: availableTerrains.some(t => t.id === this.selectedTerrainId)
				? this.selectedTerrainId
				: undefined,
			selectedHeight: this._selectedHeight,
			isHeightEnabled: this.selectedTerrainId !== undefined && this.isHeightEnabledFor(this.selectedTerrainId)
		};
	}

	/** @param {string} terrainId */
	isHeightEnabledFor(terrainId) {
		return getTerrainType(terrainId).usesHeight;
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);
		html.find("[data-terrain-id]").on("click", this.#onTerrainSelect.bind(this))
		html.find("[name='selectedHeight']").on("input", this.#onHeightChange.bind(this));
		html.find("[name='selectedHeight']").on("blur", this.#onHeightBlur.bind(this));
		html.find("[data-action='configure-terrain-types']").on("click", this.#configureTerrainTypes.bind(this));
	}

	#onTerrainSelect(event) {
		const { terrainId } = event.currentTarget.dataset;
		event.currentTarget.closest("ul").querySelectorAll("li.active").forEach(li => li.classList.remove("active"));
		event.currentTarget.closest("li").classList.add("active");
		this.element.find("[name='selectedHeight']").prop("disabled", !this.isHeightEnabledFor(terrainId));
		this.selectedTerrainId = terrainId;
	}

	#onHeightChange(event) {
		const value = +event.currentTarget.value;
		this._selectedHeight = isNaN(value) ? 0 : value;
	}

	#onHeightBlur(event) {
		// When the textbox blurs, set the height again. This is to ensure that if the user typed an invalid value, it went
		// back to 0.
		event.currentTarget.value = this._selectedHeight;
	}

	#configureTerrainTypes() {
		new TerrainTypesConfig().render(true);
	}
}
