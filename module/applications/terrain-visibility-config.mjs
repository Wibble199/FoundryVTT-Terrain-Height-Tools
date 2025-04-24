import { moduleName } from "../consts.mjs";
import { fromHook } from "../utils/signal.mjs";
import { getCssColorsFor, getInvisibleSceneTerrainTypes, getTerrainTypes, setSceneTerrainTypeVisible } from '../utils/terrain-types.mjs';
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TerrainVisibilityConfig extends withSubscriptions(HandlebarsApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainVisibilityToggle",
		window: {
			title: "TERRAINHEIGHTTOOLS.PaletteTitle",
			icon: "fas fa-eye-slash",
			contentClasses: ["terrain-height-tool-window"],
			resizable: true
		},
		position: {
			width: 220,
			height: 362
		},
		actions: {
			toggleTerrainVisible: TerrainVisibilityConfig.#toggleTerrainVisible
		}
	};

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/terrain-visibility-config.hbs`
		}
	};

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	async _prepareContext() {
		const invisibleTerrainTypes = getInvisibleSceneTerrainTypes(canvas.scene);
		return {
			availableTerrains: getTerrainTypes().map(t => ({
				id: t.id,
				name: t.name,
				visible: !invisibleTerrainTypes.has(t.id),
				...getCssColorsFor(t) // Hex colors including opacity for preview boxes
			}))
		};
	}

	/** @override */
	_onRender() {
		this._unsubscribeFromAll();
		this._subscriptions = [
			fromHook("updateScene", scene => scene.active).subscribe(() => {
				const invisibleTerrainTypes = getInvisibleSceneTerrainTypes(canvas.scene);
				this.element.querySelectorAll("[data-terrain-id]").forEach(el => {
					const isVisible = !invisibleTerrainTypes.has(el.dataset.terrainId);
					el.classList.toggle("active", isVisible);
				});
			})
		];
	}

	/**
	 * @this {TerrainVisibilityConfig}
	 * @param {HTMLElement} target
	 */
	static async #toggleTerrainVisible(_event, target) {
		const { terrainId } = target.dataset;
		target.classList.toggle("active");
		await setSceneTerrainTypeVisible(canvas.scene, terrainId);
	}
}
