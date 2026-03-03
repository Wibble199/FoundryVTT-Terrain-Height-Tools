import { moduleName } from "../consts.mjs";

/**
 * @typedef {Object} TerrainTypesPresetDialogResult
 * @property {Partial<import("../utils/terrain-types.mjs").TerrainType>[]} data
 * @property {boolean} replace
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TerrainTypesPreset extends HandlebarsApplicationMixin(ApplicationV2) {

	/** @type {(result: TerrainTypesPresetDialogResult) => void} */
	#resolve;

	/** @type {() => void} */
	#reject;

	/** @type {Promise<{ name: string; description: string; image: string; submittedBy: string; file: string; }[]>} */
	#presets;

	/**
	 * @param {(result: TerrainTypesPresetDialogResult) => void} resolve
	 * @param {() => void} reject
	 */
	constructor(resolve, reject) {
		super();

		this.#resolve = resolve;
		this.#reject = reject;

		this.#presets = fetch("modules/terrain-height-tools/presets/index.json").then(res => res.json());
	}

	static DEFAULT_OPTIONS = {
		id: "tht_terrainTypesPresets",
		window: {
			title: "TERRAINHEIGHTTOOLS.ImportTerrainTypesPreset",
			resizable: true
		},
		position: {
			width: 720
		},
		form: {
			closeOnSubmit: false
		},
		actions: {
			importCombine: TerrainTypesPreset.#importCombine,
			importReplace: TerrainTypesPreset.#importReplace
		}
	};

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/terrain-types-presets.hbs`
		},
		footer: {
			template: "templates/generic/form-footer.hbs"
		}
	};

	/** @returns {Promise<TerrainTypesPresetDialogResult>} */
	static async show() {
		return new Promise((resolve, reject) => new TerrainTypesPreset(resolve, reject).render(true));
	}

	/** @override */
	async _prepareContext() {
		return {
			presets: await this.#presets,
			buttons: [
				{
					type: "button",
					label: "Close",
					icon: "fas fa-times",
					action: "close"
				}
			]
		};
	}

	// -------------- //
	// Event handlers //
	// -------------- //
	/**
	 * @this {TerrainTypesPreset}
	 * @param {HTMLElement} target
	 * @param {boolean} replace Whether to replace (true) or combine (false).
	 */
	async #importPreset(target, replace) {
		// Figure out which one was clicked
		const index = +target.closest("[data-preset-index]").dataset.presetIndex;

		// Fetch data from file
		const filename = (await this.#presets)[index].file;
		const response = await fetch(`modules/${moduleName}/presets/${filename}`);
		const data = await response.json();

		// Close window and return the preset data to the caller
		this.close({ result: { data, replace } });
	}

	/**
	 * @this {TerrainTypesPreset}
	 * @param {HTMLElement} target
	*/
	static #importCombine(_event, target) {
		return this.#importPreset(target, false);
	}

	/**
	 * @this {TerrainTypesPreset}
	 * @param {HTMLElement} target
	*/
	static #importReplace(_event, target) {
		return this.#importPreset(target, true);
	}

	/**
	 * @override
	 * @param {{ result?: TerrainTypesPresetDialogResult }} options
	 */
	async close(options = {}) {
		if (!!options.result) this.#resolve(options.result);
		else this.#reject();

		return super.close(options);
	}
}
