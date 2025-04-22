import { moduleName } from "../consts.mjs";
import { fromHook } from "../utils/signal.mjs";
import { getCssColorsFor, getInvisibleSceneTerrainTypes, getTerrainTypes, setSceneTerrainTypeVisible } from '../utils/terrain-types.mjs';
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

export class TerrainVisibilityConfig extends withSubscriptions(Application) {

	/** @override */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.PaletteTitle"),
			id: "tht_terrainVisibilityToggle",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/terrain-visibility-config.hbs`,
			scrollY: ["ul"],
			width: 220,
			height: 351,
			resizable: true
		});
	}

	/** @override */
	_getHeaderButtons() {
		return []; // disable close
	}

	/** @override */
	getData() {
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
	activateListeners(html) {
		super.activateListeners(html);

		this._unsubscribeFromAll();
		this._subscriptions = [
			fromHook("updateScene", scene => scene.active).subscribe(() => {
				const invisibleTerrainTypes = getInvisibleSceneTerrainTypes(canvas.scene);
				html.find("[data-terrain-id]").each((_, /** @type {HTMLElement} */ el) => {
					const isVisible = !invisibleTerrainTypes.has(el.dataset.terrainId);
					el.classList.toggle("active", isVisible);
				});
			})
		];

		html.find("[data-terrain-id]").on("click", this.#onTerrainClick.bind(this));
	}

	/** @param {MouseEvent} event */
	async #onTerrainClick(event) {
		const { terrainId } = event.currentTarget.dataset;
		event.currentTarget.classList.toggle("active");
		await setSceneTerrainTypeVisible(canvas.scene, terrainId);
	}
}
