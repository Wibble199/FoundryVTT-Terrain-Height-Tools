import { html } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { moduleName } from "../consts.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";

/**
 * @typedef {Object} TerrainTypesPresetDialogResult
 * @property {Partial<import("../stores/terrain-types.mjs").TerrainType>[]} data
 * @property {boolean} replace
 */
/**
 * @typedef {Object} Preset
 * @property {string} name
 * @property {string} description
 * @property {string} image
 * @property {string} submittedBy
 * @property {string} file
 */

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

/** @type {Promise<Preset[]>} */
let presetPromise;

export class TerrainTypesPreset extends LitApplicationMixin(ApplicationV2) {

	/** @type {(result: TerrainTypesPresetDialogResult) => void} */
	#resolve;

	/** @type {() => void} */
	#reject;

	/**
	 * @param {(result: TerrainTypesPresetDialogResult) => void} resolve
	 * @param {() => void} reject
	 */
	constructor(resolve, reject) {
		super();

		this.#resolve = resolve;
		this.#reject = reject;

		presetPromise ??= fetch("modules/terrain-height-tools/presets/index.json").then(res => res.json());
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
		}
	};

	/** @override */
	async _renderHTML() {
		const presets = await presetPromise;
		return html`
			<p class="flex0">${l("TERRAINHEIGHTTOOLS.ImportTerrainTypesPresetHint")}</p>

			<ul class="preset-list">
				${presets.map(preset => html`
					<li
						class="flexcolumn"
						style=${styleMap({ backgroundImage: preset.image ? `url(modules/terrain-height-tools/presets/${preset.image})` : "" })}
					>
						<div class="preset-header">
							<p style="margin: 0;">
								<span class="preset-name">${preset.name}</span>
								<span class="preset-author">by ${preset.submittedBy}</span>
							</p>
							<p class="preset-description" style="margin: 0;">${preset.description}</p>
						</div>

						<div style="flex-grow:1">&nbsp;</div>

						<div class="preset-import-buttons">
							<button @click=${() => this.#importPreset(preset, false)}>
								<i class='fas fa-upload'></i>
								${l("TERRAINHEIGHTTOOLS.ImportCombine")}
							</button>
							<button @click=${() => this.#importPreset(preset, true)}>
								<i class='fas fa-upload'></i>
								${l("TERRAINHEIGHTTOOLS.ImportReplace")}
							</button>
						</div>
					</li>
				`)}
			</ul>

			<footer clas="form-footer">
				<button type="button" data-action="close">
					<i class="fas fa-times"></i>
					<label>${l("Close")}</label>
				</button>
			</footer>
		`;
	}

	/**
	 * @override
	 * @param {{ result?: TerrainTypesPresetDialogResult }} options
	 */
	async close(options = {}) {
		if (options.result) this.#resolve(options.result);
		else this.#reject();

		return super.close(options);
	}

	/**
	 * @this {TerrainTypesPreset}
	 * @param {Preset} preset Preset to load
	 * @param {boolean} replace Whether to replace (true) or combine (false).
	 */
	async #importPreset(preset, replace) {
		const filename = preset.file;
		const response = await fetch(`modules/${moduleName}/presets/${filename}`);
		const data = await response.json();
		this.close({ result: { data, replace } });
	}

	/** @returns {Promise<TerrainTypesPresetDialogResult>} */
	static async show() {
		return new Promise((resolve, reject) => new TerrainTypesPreset(resolve, reject).render(true));
	}
}
