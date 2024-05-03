import { moduleName, settings } from "../consts.mjs";

export class TerrainHeightPicker extends Application {

	constructor() {
		super();

		/** @type {string | undefined} */
		this.selectedTerrainId = undefined;
		this.selectedHeight = 1;
	}

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.PickerTitle"),
			id: "tht_terrainHeightPicker",
      		template: `modules/${moduleName}/templates/terrain-height-picker.hbs`,
			width: 220,
			resizable: true
		});
	}

	/** @override */
	async _render(force, options) {
		await super._render(force, options);
		if (this.initialPosition) {
			this.setPosition(this.initialPosition);
			this.initialPosition = undefined;
		}
	}

	/** @override */
	getData() {
		/** @type {import("../_types.mjs").TerrainType[]} */
		const availableTerrains = game.settings.get(moduleName, settings.terrainTypes);

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
			selectedHeight: this.selectedHeight,
		};
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);
		html.find("[data-terrain-id]").on("click", this.#onTerrainSelect.bind(this))
		html.find("[name='selectedHeight']").on("input", this.#onHeightChange.bind(this));
	}

	#onTerrainSelect(event) {
		const { terrainId } = event.currentTarget.dataset;
		event.currentTarget.closest("ul").querySelectorAll("li.active").forEach(li => li.classList.remove("active"));
		event.currentTarget.closest("li").classList.add("active");
		this.selectedTerrainId = terrainId;
	}

	#onHeightChange(event) {
		this.selectedHeight = +event.currentTarget.value;
	}
}
