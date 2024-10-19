import { moduleName } from "../consts.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

export class ShapeConversionConifg extends withSubscriptions(Application) {

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.ShapeConversionConfigTitle"),
			id: "tht_shapeConversionConfig",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/shape-conversion-config.hbs`,
			width: 200
		});
	}

	activateListeners(html) {
		super.activateListeners(html);

		/** @type {import("../layers/terrain-height-layer.mjs").TerrainHeightLayer} */
		const layer = game.canvas.terrainHeightLayer;

		this._subscriptions = [
			layer._convertConfig$.subscribe(v => {
				html.find("[name='toDrawings']").prop("checked", v.toDrawings);
				html.find("[name='toWalls']").prop("checked", v.toWalls);
				html.find("[name='deleteAfter']").prop("checked", v.deleteAfter);
			}, true)
		];

		html.find("[name='toDrawings'],[name='toWalls'],[name='deleteAfter']").on("input", e => {
			const { name, checked } = e.target;
			layer._convertConfig$.value = { ...layer._convertConfig$.value, [name]: checked };
		});
	}
}
