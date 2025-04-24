import { moduleName, wallHeightModuleName } from "../consts.mjs";
import { convertConfig$ } from "../stores/drawing.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShapeConversionConifg extends withSubscriptions(HandlebarsApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_shapeConversionConfig",
		window: {
			title: "TERRAINHEIGHTTOOLS.ShapeConversionConfigTitle",
			icon: "fas fa-arrow-turn-right",
			contentClasses: ["terrain-height-tool-window"]
		},
		position: {
			width: 200
		}
	};

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/shape-conversion-config.hbs`
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
		return {
			isWallHeightEnabled: game.modules.get(wallHeightModuleName)?.active ?? false
		};
	}

	/** @override */
	_onRender() {
		this._unsubscribeFromAll();
		this._subscriptions = [
			convertConfig$.subscribe(v => {
				this.element.querySelector("[name='toDrawing']").checked = v.toDrawing;
				this.element.querySelector("[name='toRegion']").checked = v.toRegion;
				this.element.querySelector("[name='toWalls']").checked = v.toWalls;
				this.element.querySelector("[name='deleteAfter']").checked = v.deleteAfter;

				const setWallHeightFlags = this.element.querySelector("[name='setWallHeightFlags']")
				setWallHeightFlags.checked = v.setWallHeightFlags;
				setWallHeightFlags.disabled = !v.toWalls;
			}, true)
		];

		this.element.querySelectorAll("input").forEach(el => el.addEventListener("input", e => {
			const { name, checked } = e.target;
			convertConfig$.value = { [name]: checked };
		}));
	}
}
