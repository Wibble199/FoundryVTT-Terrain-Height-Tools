import { sceneControls } from "../config/controls.mjs";
import { moduleName, settings } from "../consts.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";
import { alphaToHex } from "../utils/misc-utils.mjs";
import { join, Signal } from "../utils/signal.mjs";
import { getTerrainTypeMap } from "../utils/terrain-types.mjs";

export class TerrainStackViewer extends Application {

	#visible = false;

	/** @type {Signal<import("../utils/height-map-migrations.mjs").HeightMapDataV1Terrain[]>} */
	_terrain$ = new Signal([]);

	_keybindPressed$ = new Signal(false);

	constructor() {
		super();

		join((keybindPressed, activeControl, terrain) => {
				const wasVisible = this.#visible;

				// The stack viewer panel is visible when any of the following are true:
				// - The hotkey is being held down.
				// - The user is on the Terrain Height Tools toolbar
				// - The user is on the token layer, is hovering over a cell with terrain data, and has the option to
				//   show the toolbox on the token layer turned on.
				this.#visible = keybindPressed ||
					activeControl === moduleName ||
					(terrain.length > 0 && activeControl === "token" && game.settings.get(moduleName, settings.showTerrainStackViewerOnTokenLayer));

				this._element?.css({ display: this.#visible ? "block" : "none" });

				// when first turning visible, do a re-render, otherwise pressing the key while hoving a cell won't
				// immediately show that cell's terrain data
				if (!wasVisible && this.#visible) this.render();
			},
			this._keybindPressed$,
			sceneControls.activeControl$,
			this._terrain$);

		// Re-render when the terrain changes
		this._terrain$.subscribe(() => this.render());

		// When a scene is unloaded, be sure to clear the hovered terrain
		Hooks.on("canvasTearDown", () => this._terrain$.value = []);
	}

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: "tht_terrainStackViewer",
			template: `modules/${moduleName}/templates/terrain-stack-viewer.hbs`,
			popOut: false
		});
	}

	/** @override */
	async _render(force, options) {
		if (force || this.#visible)
			await super._render(force, options);
		this._element?.css({ display: this.#visible ? "block" : "none" })
	}

	/** @override */
	getData() {
		const terrainTypes = getTerrainTypeMap();

		const terrain = this._terrain$.value
			.filter(t => terrainTypes.has(t.terrainTypeId))
			.map(terrain => {
				/** @type {import("../utils/terrain-types.mjs").TerrainType} */
				const terrainType = terrainTypes.get(terrain.terrainTypeId);

				return {
					name: terrainType.name,
					usesHeight: terrainType.usesHeight,
					height: toSceneUnits(terrain.height),
					elevation: toSceneUnits(terrain.elevation),
					top: toSceneUnits(terrain.height + terrain.elevation),
					textColor: terrainType.textColor + alphaToHex(terrainType.textOpacity),
					borderColor: terrainType.lineWidth <= 0
						? "transparent"
						: terrainType.lineColor + alphaToHex(terrainType.lineOpacity),
					backgroundColor: terrainType.fillColor + alphaToHex(terrainType.fillOpacity),
				};
			});

		return {
			heightLayers: terrain
				.filter(t => t.usesHeight)
				.sort((a, b) => b.elevation - a.elevation),
			noHeightLayers: terrain
				.filter(t => !t.usesHeight)
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "accent" }))
		};
	}

	/** @override */
	get element() {
		if (this._element) return this._element;

		// If the element has not yet been created, add it to the UI in the desired place
		const el = $("<div></div>");
		$("#ui-bottom").prepend(el);
		return el;
	}
}
