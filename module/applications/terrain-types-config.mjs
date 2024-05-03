import { moduleName, settings } from "../consts.mjs";

export class TerrainTypesConfig extends FormApplication {

	constructor() {
		super(game.settings.get(moduleName, settings.terrainTypes));
	}

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("SETTINGS.TerrainTypes.Button"),
			id: "tht_terrainTypesConfig",
			template: `modules/${moduleName}/templates/terrain-types-config.hbs`,
			width: 840,
			height: 720,
			closeOnSubmit: false
		});
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);
		html.find("[data-action='terrain-type-add']").on("click", this.#addTerrainType.bind(this));
	}

	/** @override */
	getData(options = {}) {
		const data = super.getData(options);

		data.fillTypes = Object.fromEntries(Object.entries(CONST.DRAWING_FILL_TYPES)
			.map(([name, value]) => [value, `DRAWING.FillType${name.titleCase()}`]));

		data.fonts = FontConfig.getAvailableFontChoices();

		return data;
	}

	/** @override */
	async _updateObject(_, formData) {
		// Convert form data to array
		const terrainTypes = Object.entries(expandObject(formData))
			.sort((a, b) => a[0] - b[0])
			.map(([_, value]) => value);

		// TODO: check valid
		if (true) {
			await game.settings.set(moduleName, settings.terrainTypes, terrainTypes);
			this.close();
		}
	}

	#addTerrainType() {
		/** @type {import("../_types.mjs").TerrainType} */
		const newTerrainType = {
			id: randomID(),
			name: "New Terrain Type",
			lineWidth: 4,
			lineColor: "#FF0000",
			lineOpacity: 0.8,
			fillType: CONST.DRAWING_FILL_TYPES.SOLID,
			fillColor: "#FF0000",
			fillOpacity: 0.2,
			fillTexture: "",
			textFormat: "",
			font: CONFIG.defaultFontFamily,
			textSize: 48,
			textColor: "#FFFFFF",
			textOpacity: 1
		};

		this.object.push(newTerrainType);
		this.render();
	}
}
