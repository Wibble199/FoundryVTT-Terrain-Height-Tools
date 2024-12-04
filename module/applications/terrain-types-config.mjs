/** @import { TerrainType } from "../utils/terrain-types.mjs" */
import { lineTypes, moduleName, settings } from "../consts.mjs";
import { error } from "../utils/log.mjs";
import { createDefaultTerrainType, getTerrainTypes } from '../utils/terrain-types.mjs';
import { TerrainTypesPreset } from "./terrain-types-presets.mjs";

export class TerrainTypesConfig extends FormApplication {

	constructor() {
		super(getTerrainTypes());

		/** @type {{ [typeId: string]: true; }} */
		this._expandedTypes = {};
	}

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("SETTINGS.TerrainTypes.Button"),
			id: "tht_terrainTypesConfig",
			template: `modules/${moduleName}/templates/terrain-types-config.hbs`,
			scrollY: [".terrain-type-list"],
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

		data.lineTypes = Object.fromEntries(Object.entries(lineTypes)
			.map(([name, value]) => [value, `TERRAINHEIGHTTOOLS.LineType${name.titleCase()}`]));

		data.fonts = FontConfig.getAvailableFontChoices();

		data.expandedTypes = this._expandedTypes;

		return data;
	}

	/**
	 * @override
	 * @returns {TerrainType[]}
	 */
	_getSubmitData(updateData = {}) {
		const formData = super._getSubmitData(updateData);

		/** @type {(TerrainType & { isZone: boolean; })[]} */
		const terrainTypes = Object.entries(expandObject(formData))
			.sort((a, b) => a[0] - b[0])
			.map(([_, value]) => value);

		// Since the "Uses height?" option was changed to "Is zone?" we need to invert the checkbox.
		// We don't create a new property for this because we don't want to mess with peoples' existing configs.
		for (const terrainType of terrainTypes) {
			terrainType.usesHeight = !terrainType.isZone;
			delete terrainType.isZone;
		}

		return terrainTypes;
	}

	/** @override */
	async _updateObject(_, formData) {
		// TODO: check valid
		//if (true) {
		await game.settings.set(moduleName, settings.terrainTypes, formData);
		this.close();
		//}
	}

	/** Saves the UI state into the object. */
	sync() {
		this.object = this._getSubmitData();
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
		html.find("[data-action='terrain-types-import-preset']").on("click", this.#showImportPresetsDialog.bind(this));
		html.find("[data-action='terrain-types-import']").on("click", this.#showImportTerrainTypeSettingsDialog.bind(this));
		html.find("[data-action='terrain-types-export']").on("click", this.#showExportTerrainTypeSettingsDialog.bind(this));
	}

	#toggleExpand(event) {
		this.sync();
		const { terrainTypeId } = event.currentTarget.closest("[data-terrain-type-id]").dataset;
		if (this._expandedTypes[terrainTypeId])
			delete this._expandedTypes[terrainTypeId];
		else
			this._expandedTypes[terrainTypeId] = true;
		this.render();
	}

	#addTerrainType() {
		this.sync();
		/** @type {TerrainType} */
		const newTerrainType = createDefaultTerrainType();
		this.object.push(newTerrainType);
		this._expandedTypes[newTerrainType.id] = true;
		this.render();
	}

	#moveTerrainType(event, dir) {
		this.sync();
		const { terrainTypeId } = event.currentTarget.closest("[data-terrain-type-id]").dataset;
		const index = this.object.findIndex(t => t.id === terrainTypeId);

		// Cannot move if already at the start/end
		if ((dir > 0 && index >= this.object.length) || (dir < 0 && index <= 0)) return;

		const [terrainType] = this.object.splice(index, 1);
		this.object.splice(index + dir, 0, terrainType);
		this.render();
	}

	#duplicateTerrainType(event) {
		this.sync();
		const { terrainTypeId } = event.currentTarget.closest("[data-terrain-type-id]").dataset;
		const existingTerrainType = this.object.find(t => t.id === terrainTypeId);
		const newTerrainType = { ...existingTerrainType, id: randomID(), name: existingTerrainType.name + " (2)" };
		this.object.push(newTerrainType);
		this._expandedTypes[newTerrainType.id] = true;
		this.render();
	}

	#deleteTerrainType(event) {
		this.sync();
		const { terrainTypeId } = event.currentTarget.closest("[data-terrain-type-id]").dataset;
		const index = this.object.findIndex(t => t.id === terrainTypeId);
		this.object.splice(index, 1);
		this.render();
	}

	// ------------- //
	// Import/export //
	// ------------- //
	async #showImportPresetsDialog() {
		this.sync();

		// Ask user to select a preset
		try {
			const { data, replace } = await TerrainTypesPreset.show();
			this._importTerrainTypeSettings(data, replace);
		} catch {
			return; // User cancelled
		}
	}

	#showImportTerrainTypeSettingsDialog() {
		this.sync();
		new Dialog({
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.ImportTerrainTypes"),
			content: `<textarea placeholder="${game.i18n.localize("TERRAINHEIGHTTOOLS.ImportTextPlaceholder")}"></textarea>`,
			buttons: {
				importCombine: {
					icon: "<i class='fas fa-upload'></i>",
					label: game.i18n.localize("TERRAINHEIGHTTOOLS.ImportCombine"),
					callback: html => {
						if (!this._importTerrainTypeSettings(html.find("textarea").val(), false))
							throw new Error("Invalid data"); // Throw as an error to prevent dialog from closing
					}
				},
				importReplace: {
					icon: "<i class='fas fa-upload'></i>",
					label: game.i18n.localize("TERRAINHEIGHTTOOLS.ImportReplace"),
					callback: html => {
						if (!this._importTerrainTypeSettings(html.find("textarea").val(), true))
							throw new Error("Invalid data"); // Throw as an error to prevent dialog from closing
					}
				},
				close: {
					icon: "<i class='fas fa-times'></i>",
					label: game.i18n.localize("Close")
				}
			}
		}, {
			id: "tht_terrainTypesImport",
			width: 720,
			height: 350,
			resizable: true
		}).render(true);
	}

	#showExportTerrainTypeSettingsDialog() {
		this.sync();
		new Dialog({
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.ExportTerrainTypes"),
			content: `<textarea readonly>${JSON.stringify(this.object)}</textarea>`,
			buttons: {
				close: {
					icon: "<i class='fas fa-check'></i>",
					label: game.i18n.localize("Close")
				}
			}
		}, {
			id: "tht_terrainTypesExport",
			width: 720,
			height: 350,
			resizable: true
		}).render(true);
	}

	/**
	 * @param {string | Partial<TerrainType>[]} data Data to import. Either a JSON
	 * string or an already-parsed array.
	 * @param {boolean} replace Whether or not to delete all existing terrain types on a successful import.
	 * @returns {boolean} Boolean indicating if the import was successful.
	 */
	_importTerrainTypeSettings(data, replace = false) {
		if (!data?.length) return;

		const parsed = Array.isArray(data) ? data : JSON.parse(data);

		if (!Array.isArray(parsed)) {
			error("Failed to import terrain type data: Expected JSON to be an array.");
			return false;
		}

		const sanitisedData = [];
		const defaultTerrainType = createDefaultTerrainType();
		for (let i = 0; i < parsed.length; i++) {
			if (typeof parsed[i] !== "object") {
				error(`Expected item at index ${i} to be an object, but found`, item);
				return false;
			}

			// If we're in combine mode (replace = false), then see if there is one already with the same ID
			const existing = replace
				? undefined
				: this.object.find(t => t.id === parsed[i].id);

			// Combine it with defaults,
			const sanitisedTerrainType = {
				...defaultTerrainType,
				...(existing ?? {}),
				...parsed[i]
			};

			// Check that property types match those declared in the defaultTerrainType
			for (const [key, value] of Object.entries(defaultTerrainType)) {
				if (typeof sanitisedTerrainType[key] !== typeof value) {
					error(`Expected property '${key}' of item at index ${i} to be of type ${typeof value}, but found`, sanitisedTerrainType[key]);
					return false;
				}
			}

			sanitisedData.push(sanitisedTerrainType);
		}

		if (replace) {
			this.object = sanitisedData;
		} else {
			// If combining, remove any existing with the same ID as an imported one
			const newIds = sanitisedData.map(t => t.id);
			this.object = [
				...this.object.filter(t => !newIds.includes(t.id)),
				...sanitisedData
			];
		}

		this.render();
		return true;
	}
}
