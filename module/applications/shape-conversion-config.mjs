import { moduleName } from "../consts.mjs";
import { convertConfig$ } from "../stores/drawing.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

export class ShapeConversionConifg extends withSubscriptions(Application) {

	/** @override */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.ShapeConversionConfigTitle"),
			id: "tht_shapeConversionConfig",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/shape-conversion-config.hbs`,
			width: 200
		});
	}

	/** @override */
	_getHeaderButtons() {
		return []; // disable close
	}

	activateListeners(html) {
		super.activateListeners(html);

		this._subscriptions = [
			convertConfig$.subscribe(v => {
				html.find("[name='toDrawing']").prop("checked", v.toDrawing);
				html.find("[name='toRegion']").prop("checked", v.toRegion);
				html.find("[name='toWalls']").prop("checked", v.toWalls);
				html.find("[name='deleteAfter']").prop("checked", v.deleteAfter);
			}, true)
		];

		html.find("[name='toDrawing'],[name='toRegion'],[name='toWalls'],[name='deleteAfter']").on("input", e => {
			const { name, checked } = e.target;
			convertConfig$.value = { [name]: checked };
		});
	}
}
