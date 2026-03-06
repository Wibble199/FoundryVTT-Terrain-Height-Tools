/** @import { Signal } from "@preact/signals-core" */
import { effect, signal } from "@preact/signals-core";
import { sceneControls } from "../config/controls.mjs";
import { keyPressedSignals } from "../config/keybindings.mjs";
import { keybindings, moduleName, settingNames } from "../consts.mjs";
import { getCssColorsFor, terrainTypeMap$ } from "../stores/terrain-types.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";

// How many pixels each unit in height is represented by in proportional mode.
const proportionalModeScale = 28;

// How many pixels a 1-width border should be shown as in the SVG.
const proportionalModeBorderScale = 0.5;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TerrainStackViewer extends HandlebarsApplicationMixin(ApplicationV2) {

	#visible = false;

	/** @type {Signal<import("../utils/height-map-migrations.mjs").HeightMapDataV1Terrain[]>} */
	_terrain$ = signal([]);

	constructor() {
		super();

		effect(() => {
			const wasVisible = this.#visible;

			// The stack viewer panel is visible when any of the following are true:
			// - The hotkey is being held down.
			// - The user is on the Terrain Height Tools toolbar
			// - The user is on the token layer, is hovering over a cell with terrain data, and has the option to
			//   show the toolbox on the token layer turned on.
			this.#visible = keyPressedSignals[keybindings.showTerrainStack].value ||
				sceneControls.activeControl$.value === moduleName ||
				(
					this._terrain$.value.length > 0 &&
					sceneControls.activeControl$.value === "token" &&
					game.settings.get(moduleName, settingNames.showTerrainStackViewerOnTokenLayer)
				);

			this.#updateVisibility();

			// when first turning visible, do a re-render, otherwise pressing the key while hoving a cell won't
			// immediately show that cell's terrain data
			if (!wasVisible && this.#visible) this.render();
		});

		// Re-render when the terrain changes
		this._terrain$.subscribe(() => {
			if (this.#visible)
				this.render();
		});

		// When a scene is unloaded, be sure to clear the hovered terrain
		Hooks.on("canvasTearDown", () => this._terrain$.value = []);
	}

	static DEFAULT_OPTIONS = {
		id: "tht_terrainStackViewer",
		window: {
			title: "TERRAINHEIGHTTOOLS.Terrain",
			icon: "fas fa-chart-simple",
			contentClasses: ["terrain-height-tool-window"],
			minimizable: false,
			positioned: false
		}
	};

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/terrain-stack-viewer.hbs`
		}
	};

	/** @override */
	_insertElement(element) {
		const existing = document.getElementById(element.id);
		if (existing) existing.replaceWith(element);
		else document.getElementById("ui-bottom").prepend(element);
	}

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_onRender() {
		this.#updateVisibility();
	}

	#updateVisibility() {
		if (this.element)
			this.element.style.display = this.#visible ? "block" : "none";
	}

	/** @override */
	async _prepareContext() {
		const terrainTypes = terrainTypeMap$.value;

		const terrain = this._terrain$.value
			.filter(t => terrainTypes.has(t.terrainTypeId))
			.map(terrain => {
				/** @type {import("../stores/terrain-types.mjs").TerrainType} */
				const terrainType = terrainTypes.get(terrain.terrainTypeId);

				return {
					name: terrainType.name,
					usesHeight: terrainType.usesHeight,
					elevation: terrain.elevation,
					height: terrain.height,
					displayHeight: toSceneUnits(terrain.height),
					displayElevation: toSceneUnits(terrain.elevation),
					displayTop: toSceneUnits(terrain.height + terrain.elevation),
					...getCssColorsFor(terrainType)
				};
			});

		const heightLayers = terrain
			.filter(t => t.usesHeight)
			.sort((a, b) => b.elevation - a.elevation);

		const noHeightLayers = terrain
			.filter(t => !t.usesHeight)
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "accent" }));

		const highestElevation = Math.max((heightLayers[0]?.elevation ?? 0) + (heightLayers[0]?.height ?? 0), 0);

		const configuredDisplayMode = game.settings.get(moduleName, settingNames.terrainStackViewerDisplayMode);
		const isProportionalDisplayMode = configuredDisplayMode === "auto"
			? highestElevation <= 8
			: configuredDisplayMode === "proportional";

		return {
			heightLayers,
			noHeightLayers,
			highestElevation,

			isProportionalDisplayMode,
			proportionalModeScale: proportionalModeScale,
			proportionalBorderScale: proportionalModeBorderScale,
			proportionalAxisLabels: isProportionalDisplayMode
				? new Array(Math.ceil(highestElevation)).fill(0).map((_, i) => ({ label: toSceneUnits(i + 1), y: i + 1 }))
				: null
		};
	}
}
