import { moduleName } from "../consts.mjs";

/**
 * @typedef {Object} TerrainTypesPresetDialogResult
 * @property {Partial<import("../utils/terrain-types.mjs").TerrainType>[]} data
 * @property {boolean} replace
 */

export class TerrainTypesPreset extends Application {

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

	/** @returns {Promise<TerrainTypesPresetDialogResult>} */
	static async show() {
		return new Promise((resolve, reject) => new TerrainTypesPreset(resolve, reject).render(true));
	}

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.ImportTerrainTypesPreset"),
			id: "tht_terrainTypesPresets",
			template: `modules/${moduleName}/templates/terrain-types-presets.hbs`,
			scrollY: [".preset-list"],
			width: 720,
			resizable: true,
			closeOnSubmit: false
		});
	}

	/** @override */
	async getData(options = {}) {
		const data = await super.getData(options);
		data.presets = await this.#presets;
		return data;
	}

	// -------------- //
	// Event handlers //
	// -------------- //
	/** @override */
	activateListeners(html) {
		html.find("[data-action='import-combine'],[data-action='import-replace']").on("click", this.#importPreset.bind(this));
		html.find("[data-action='close']").on("click", () => this.close());
	}

	/** @param {MouseEvent} event */
	async #importPreset(event) {
		// Figure out which one was clicked
		const index = +event.currentTarget.closest("[data-preset-index]").dataset.presetIndex;
		const replace = event.currentTarget.dataset.action === "import-replace";

		// Fetch data from file
		const filename = (await this.#presets)[index].file;
		const response = await fetch(`modules/${moduleName}/presets/${filename}`);
		const data = await response.json();

		// Close window and return the preset data to the caller
		this.close({ result: { data, replace } });
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
