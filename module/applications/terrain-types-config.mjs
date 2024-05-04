import { moduleName, settings } from "../consts.mjs";

export class TerrainTypesConfig extends FormApplication {

	constructor() {
		super(game.settings.get(moduleName, settings.terrainTypes));

		/** @type {{ [typeId: string]: true; }} */
		this._expandedTypes = {};
	}

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("SETTINGS.TerrainTypes.Button"),
			id: "tht_terrainTypesConfig",
			template: `modules/${moduleName}/templates/terrain-types-config.hbs`,
			width: 840,
			height: 720,
			resizable: true,
			closeOnSubmit: false
		});
	}

	/** @override */
	getData(options = {}) {
		const data = super.getData(options);

		data.fillTypes = Object.fromEntries(Object.entries(CONST.DRAWING_FILL_TYPES)
			.map(([name, value]) => [value, `DRAWING.FillType${name.titleCase()}`]));

		data.fonts = FontConfig.getAvailableFontChoices();

		data.expandedTypes = this._expandedTypes;

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

	// -------------- //
	// Event handlers //
	// -------------- //
	/** @override */
	activateListeners(html) {
		super.activateListeners(html);
		html.find("[data-action='toggle-expand']").on("click", this.#toggleExpand.bind(this));
		html.find("[data-action='move-up']").on("click", event => this.#moveTerrainType(event, -1));
		html.find("[data-action='move-down']").on("click", event => this.#moveTerrainType(event, 1));
		html.find("[data-action='duplicate']").on("click", this.#duplicateTerrainType.bind(this));
		html.find("[data-action='delete']").on("click", this.#deleteTerrainType.bind(this));
		html.find("[data-action='terrain-type-add']").on("click", this.#addTerrainType.bind(this));
	}

	#toggleExpand(event) {
		const { terrainTypeId } = event.currentTarget.closest("[data-terrain-type-id]").dataset;
		if (this._expandedTypes[terrainTypeId])
			delete this._expandedTypes[terrainTypeId];
		else
			this._expandedTypes[terrainTypeId] = true;
		this.render();
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

	#moveTerrainType(event, dir) {
		const { terrainTypeId } = event.currentTarget.closest("[data-terrain-type-id]").dataset;
		const index = this.object.findIndex(t => t.id === terrainTypeId);

		// Cannot move if already at the start/end
		if ((dir > 0 && index >= this.object.length) || (dir < 0 && index <= 0)) return;

		const [terrainType] = this.object.splice(index, 1);
		this.object.splice(index + dir, 0, terrainType);
		this.render();
	}

	#duplicateTerrainType(event) {
		const { terrainTypeId } = event.currentTarget.closest("[data-terrain-type-id]").dataset;
		const terrainType = this.object.find(t => t.id === terrainTypeId);
		this.object.push({ ...terrainType, id: randomID(), name: terrainType.name + " (2)" });
		this.render();
	}

	#deleteTerrainType(event) {
		const { terrainTypeId } = event.currentTarget.closest("[data-terrain-type-id]").dataset;
		const index = this.object.findIndex(t => t.id === terrainTypeId);
		this.object.splice(index, 1);
		this.render();
	}
}
