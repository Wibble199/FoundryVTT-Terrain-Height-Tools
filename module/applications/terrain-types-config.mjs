/** @import { TerrainType } from "../utils/terrain-types.mjs" */
import { lineTypes, moduleName, settings } from "../consts.mjs";
import { createDefaultTerrainType, getTerrainTypes } from '../utils/terrain-types.mjs';
import { TerrainTypesPreset } from "./terrain-types-presets.mjs";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TerrainTypesConfig extends HandlebarsApplicationMixin(ApplicationV2) {

	#terrainTypes;

	#selectedTerrainTypeId;

	constructor() {
		super();

		this.#terrainTypes = getTerrainTypes();
		this.#selectedTerrainTypeId = this.#terrainTypes[0]?.id ?? "";
	}

	static DEFAULT_OPTIONS = {
		id: "tht_terrainTypesConfig",
		tag: "form",
		classes: ["sheet"],
		window: {
			title: "SETTINGS.TerrainTypes.Button",
			contentClasses: ["standard-form"],
			resizable: true,
		},
		position: {
			width: 860,
			height: 720
		},
		form: {
			handler: TerrainTypesConfig.#onFormSubmit,
			submitOnChange: true,
			closeOnSubmit: false
		},
		actions: {
			selectTerrainType: TerrainTypesConfig.#selectTerrainType,
			moveTerrainTypeUp: TerrainTypesConfig.#moveTerrainTypeUp,
			moveTerrainTypeDown: TerrainTypesConfig.#moveTerrainTypeDown,
			duplicateTerrainType: TerrainTypesConfig.#duplicateTerrainType,
			deleteTerrainType: TerrainTypesConfig.#deleteTerrainType,
			addTerrainType: TerrainTypesConfig.#addTerrainType,
			importTerrainTypesPreset: TerrainTypesConfig.#showImportPresetsDialog,
			importTerrainTypes: TerrainTypesConfig.#showImportTerrainTypeSettingsDialog,
			exportTerrainTypes: TerrainTypesConfig.#showExportTerrainTypeSettingsDialog,
			saveTerrainTypes: TerrainTypesConfig.#saveTerrainTypes
		}
	};

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/terrain-types-config.hbs`,
			scrollable: [".terrain-type-list", ".terrain-type-edit-pane"]
		},
		footer: {
			template: "templates/generic/form-footer.hbs",
		}
	};

	tabGroups = {
		main: "lines"
	};

	/** @override */
	async _prepareContext() {
		return {
			terrainTypes: this.#terrainTypes,

			fillTypes: Object.fromEntries(Object.entries(CONST.DRAWING_FILL_TYPES)
				.map(([name, value]) => [value, `DRAWING.FillType${name.titleCase()}`])),

			lineTypes: Object.fromEntries(Object.entries(lineTypes)
				.map(([name, value]) => [value, `TERRAINHEIGHTTOOLS.LineType${name.titleCase()}`])),

			fonts: FontConfig.getAvailableFontChoices(),

			selectedTerrainTypeId: this.#selectedTerrainTypeId,

			labelPlaceholderHtml: this.#getLabelPlaceholderTooltipHtml(),

			activeTab: this.tabGroups.main,

			// Footer buttons
			buttons: [
				{
					type: "button",
					icon: "fas fa-plus",
					label: "TERRAINHEIGHTTOOLS.AddTerrainType",
					action: "addTerrainType"
				},
				{
					type: "button",
					icon: "fas fa-palette",
					label: "TERRAINHEIGHTTOOLS.ImportTerrainTypesPreset",
					action: "importTerrainTypesPreset"
				},
				{
					type: "button",
					icon: "fas fa-upload",
					label: "TERRAINHEIGHTTOOLS.ImportTerrainTypes",
					action: "importTerrainTypes"
				},
				{
					type: "button",
					icon: "fas fa-download",
					label: "TERRAINHEIGHTTOOLS.ExportTerrainTypes",
					action: "exportTerrainTypes"
				},
				{
					type: "button",
					label: "Save Changes",
					icon: "fas fa-save",
					action: "saveTerrainTypes"
				}
			]
		};
	}

	/**
	 * @param {FormDataExtended} formData
	 * @returns {TerrainType[]}
	 */
	#getTerrainTypesFromForm(formData) {
		/** @type {(TerrainType & { isZone: boolean; })[]} */
		const terrainTypes = Object.entries(foundry.utils.expandObject(formData.object))
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

	/** @param {{ isFirstRender: boolean; }} options */
	_onRender(_context, options) {
		if (options.isFirstRender) {
			new ContextMenu(this.element, ".terrain-type-list > li", [
				{ name: "Delete", icon: "<i class='fas fa-trash'></i>", callback: (...args) => console.log("CM", ...args) }
			]);
		}
	}

	// --------------- //
	// Action handlers //
	// --------------- //
	/**
	 * @this {TerrainTypesConfig}
	 * @param {FormDataExtended} formData
	 */
	static #onFormSubmit(_event, _form, formData) {
		this.#terrainTypes = this.#getTerrainTypesFromForm(formData);
		this.render();
	}

	/**
	 * @this {TerrainTypesConfig}
	 * @param {HTMLElement} target
	 */
	static #selectTerrainType(_event, target) {
		this.#selectedTerrainTypeId = target.dataset.terrainTypeId;
		this.render();
	}

	/** @this {TerrainTypesConfig} */
	static #addTerrainType() {
		/** @type {TerrainType} */
		const newTerrainType = createDefaultTerrainType();
		this.#terrainTypes.push(newTerrainType);
		this.#selectedTerrainTypeId = newTerrainType.id;
		this.render();
	}

	/**
	 * @this {TerrainTypesConfig}
	 * @param {HTMLElement} target
	 */
	static #moveTerrainTypeUp(_event, target) {
		this.#moveTerrainType(target, -1);
	}

	/**
	 * @this {TerrainTypesConfig}
	 * @param {HTMLElement} target
	 */
	static #moveTerrainTypeDown(_event, target) {
		this.#moveTerrainType(target, 1);
	}

	/**
	 * @param {HTMLElement} target
	 * @param {1 | -1} dir
	 */
	#moveTerrainType(target, dir) {
		const { terrainTypeId } = target.closest("[data-terrain-type-id]").dataset;
		const index = this.#terrainTypes.findIndex(t => t.id === terrainTypeId);

		// Cannot move if already at the start/end
		if ((dir > 0 && index >= this.#terrainTypes.length) || (dir < 0 && index <= 0)) return;

		const [terrainType] = this.#terrainTypes.splice(index, 1);
		this.#terrainTypes.splice(index + dir, 0, terrainType);
		this.render();
	}

	/**
	 * @this {TerrainTypesConfig}
	 * @param {*} event
	 */
	static #duplicateTerrainType(_event, target) {
		const { terrainTypeId } = target.closest("[data-terrain-type-id]").dataset;
		const existingTerrainType = this.#terrainTypes.find(t => t.id === terrainTypeId);
		const newTerrainType = {
			...existingTerrainType,
			id: foundry.utils.randomID(),
			name: existingTerrainType.name + " (2)"
		};
		this.#terrainTypes.push(newTerrainType);
		this.#selectedTerrainTypeId = newTerrainType.id;
		this.render();
	}

	/**
	 * @this {TerrainTypesConfig}
	 * @param {HTMLElement} target
	 */
	static #deleteTerrainType(_event, target) {
		const { terrainTypeId } = target.closest("[data-terrain-type-id]").dataset;
		const index = this.#terrainTypes.findIndex(t => t.id === terrainTypeId);
		this.#terrainTypes.splice(index, 1);
		this.render();
	}

	/** @this {TerrainTypesConfig} */
	static async #saveTerrainTypes() {
		const formData = new FormDataExtended(this.element);
		const terrainTypes = this.#getTerrainTypesFromForm(formData);
		await game.settings.set(moduleName, settings.terrainTypes, terrainTypes);
		await this.close();
	}

	// ------------- //
	// Import/export //
	// ------------- //
	/** @this {TerrainTypesConfig} */
	static async #showImportPresetsDialog() {
		// Ask user to select a preset
		try {
			const { data, replace } = await TerrainTypesPreset.show();
			this._importTerrainTypeSettings(data, replace);
		} catch {
			return; // User cancelled
		}
	}

	/** @this {TerrainTypesConfig} */
	static #showImportTerrainTypeSettingsDialog() {
		new DialogV2({
			id: "tht_terrainTypesImport",
			window: {
				title: game.i18n.localize("TERRAINHEIGHTTOOLS.ImportTerrainTypes"),
				icon: "fas fa-upload",
				resizable: true
			},
			content: `<textarea placeholder="${game.i18n.localize("TERRAINHEIGHTTOOLS.ImportTextPlaceholder")}"></textarea>`,
			buttons: [
				{
					icon: "<i class='fas fa-upload'></i>",
					label: game.i18n.localize("TERRAINHEIGHTTOOLS.ImportCombine"),
					action: "importCombine",
					callback: (_event, _target, element) => {
						if (!this._importTerrainTypeSettings(element.querySelector("textarea").value, false))
							throw new Error("Invalid data"); // Throw as an error to prevent dialog from closing
					}
				},
				{
					icon: "<i class='fas fa-upload'></i>",
					label: game.i18n.localize("TERRAINHEIGHTTOOLS.ImportReplace"),
					action: "importReplace",
					callback: (_event, _target, element) => {
						if (!this._importTerrainTypeSettings(element.querySelector("textarea").value, true))
							throw new Error("Invalid data"); // Throw as an error to prevent dialog from closing
					}
				},
				{
					icon: "<i class='fas fa-times'></i>",
					label: game.i18n.localize("Close"),
					action: "close"
				}
			],
			position: {
				width: 720,
				height: 350
			}
		}).render(true);
	}

	/** @this {TerrainTypesConfig} */
	static #showExportTerrainTypeSettingsDialog() {
		new DialogV2({
			id: "tht_terrainTypesExport",
			window: {
				title: game.i18n.localize("TERRAINHEIGHTTOOLS.ExportTerrainTypes"),
				icon: "fas fa-download",
				contentClasses: ["terrain-height-tool-window"],
				resizable: true
			},
			content: `<textarea readonly>${JSON.stringify(this.#terrainTypes)}</textarea>`,
			buttons: [
				{
					icon: "<i class='fas fa-check'></i>",
					label: game.i18n.localize("Close"),
					action: "close"
				}
			],
			position: {
				width: 720,
				height: 350
			}
		}).render(true);
	}

	/**
	 * @param {string | Partial<TerrainType>[]} data Data to import. Either a JSON string or an already-parsed array.
	 * @param {boolean} replace Whether or not to delete all existing terrain types on a successful import.
	 * @returns {boolean} Boolean indicating if the import was successful.
	 */
	_importTerrainTypeSettings(data, replace = false) {
		if (!data?.length) return;

		const parsed = Array.isArray(data) ? data : JSON.parse(data);

		if (!Array.isArray(parsed)) {
			ui.notifications.error("Failed to import terrain type data: Expected JSON to be an array.");
			return false;
		}

		const sanitisedData = [];
		const defaultTerrainType = createDefaultTerrainType();
		for (let i = 0; i < parsed.length; i++) {
			if (typeof parsed[i] !== "object") {
				ui.notifications.error(`Expected item at index ${i} to be an object, but found`, item);
				return false;
			}

			// If we're in combine mode (replace = false), then see if there is one already with the same ID
			const existing = replace
				? undefined
				: this.#terrainTypes.find(t => t.id === parsed[i].id);

			// Combine it with defaults,
			const sanitisedTerrainType = {
				...defaultTerrainType,
				...(existing ?? {}),
				...parsed[i]
			};

			// Check that property types match those declared in the defaultTerrainType
			for (const [key, value] of Object.entries(defaultTerrainType)) {
				if (typeof sanitisedTerrainType[key] !== typeof value) {
					ui.notifications.error(`Expected property '${key}' of item at index ${i} to be of type ${typeof value}, but found`, sanitisedTerrainType[key]);
					return false;
				}
			}

			sanitisedData.push(sanitisedTerrainType);
		}

		if (replace) {
			this.#terrainTypes = sanitisedData;
		} else {
			// If combining, remove any existing with the same ID as an imported one
			const newIds = sanitisedData.map(t => t.id);
			this.#terrainTypes = [
				...this.#terrainTypes.filter(t => !newIds.includes(t.id)),
				...sanitisedData
			];
		}

		this.render();
		return true;
	}

	#getLabelPlaceholderTooltipHtml() {
		const placeholders = [
			["%h%", game.i18n.localize("TERRAINHEIGHTTOOLS.Placeholders.Height")],
			["%e%", game.i18n.localize("TERRAINHEIGHTTOOLS.Placeholders.Elevation")],
			["%t%", game.i18n.localize("TERRAINHEIGHTTOOLS.Placeholders.Top")]
		];
		return `
			<p>${game.i18n.localize("TERRAINHEIGHTTOOLS.Placeholders.PlaceholderHelpText")}</p>
			<table>
				<tbody>
					${placeholders.map(([key, description]) => `<tr>
						<th>${key}</th>
						<td>${description}</td>
					</tr>`).join("")}
				</tbody>
			</table>
		`;
	}
}
