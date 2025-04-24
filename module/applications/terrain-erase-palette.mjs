import { moduleName } from "../consts.mjs";
import { eraseConfig$ } from "../stores/drawing.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { getCssColorsFor, getTerrainTypes } from '../utils/terrain-types.mjs';
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TerrainErasePalette extends withSubscriptions(HandlebarsApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainErasePalette",
		window: {
			title: "TERRAINHEIGHTTOOLS.PaletteTitle",
			icon: "fas fa-eraser",
			contentClasses: ["terrain-height-tool-window"],
			resizable: true,
			minimizable: false
		},
		position: {
			width: 220,
			height: 385
		},
		actions: {
			selectTerrain: TerrainErasePalette.#selectTerrain,
			selectAll: TerrainErasePalette.#selectAll,
			selectNone: TerrainErasePalette.#selectNone,
			selectInverse: TerrainErasePalette.#selectInverse
		}
	}

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/terrain-erase-palette.hbs`
		}
	}

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	async _prepareContext() {
		return {
			availableTerrains: getTerrainTypes().map(t => ({
				id: t.id,
				name: t.name,

				// Hex colors including opacity for preview boxes:
				...getCssColorsFor(t)
			}))
		};
	}

	/** @override */
	_onRender() {
		this._unsubscribeFromAll();
		this._subscriptions = [
			eraseConfig$.excludedTerrainTypeIds$.subscribe(excludedTerrainTypeIds => {
				this.element.querySelectorAll("[data-terrain-id]").forEach(el => {
					const isExcluded = excludedTerrainTypeIds.includes(el.dataset.terrainId);
					el.classList.toggle("active", !isExcluded);
				});
			}, true),

			eraseConfig$.bottom$.subscribe(bottom => {
				this.element.querySelector("[name='bottom']").value = toSceneUnits(bottom);
				this.element.querySelector("[name='top']").min = toSceneUnits(bottom) ?? 0;
			}, true),

			eraseConfig$.top$.subscribe(top => {
				this.element.querySelector("[name='top']").value = toSceneUnits(top);
				this.element.querySelector("[name='bottom']").max = toSceneUnits(top);
			}, true)
		];

		// On input change, update the relevant Signal
		this.element.querySelector("[name='bottom']").addEventListener("input", evt =>
			eraseConfig$.bottom$.value = fromSceneUnits(this.#getInputValue(evt)));

		this.element.querySelector("[name='top']").addEventListener("input", evt =>
			eraseConfig$.top$.value = fromSceneUnits(this.#getInputValue(evt)));

		// On blur, ensure that the value is below/above the other value and then set the value of the input to the
		// Signal, so that if it was left as an invalid number it resets and shows the correct value again.
		this.element.querySelector("[name='bottom']").addEventListener("blur", evt => {
			let { bottom, top } = eraseConfig$.value;
			if (typeof bottom === "number" && typeof top === "number" && bottom > top)
				bottom = eraseConfig$.bottom$.value = top;

			evt.currentTarget.value = toSceneUnits(bottom);
		});

		this.element.querySelector("[name='top']").addEventListener("blur", evt => {
			let { bottom, top } = eraseConfig$.value;
			if (typeof bottom === "number" && typeof top === "number" && top < bottom)
				top = eraseConfig$.top$.value = bottom;

			evt.currentTarget.value = toSceneUnits(top);
		});
	}

	/**
	 * @this {TerrainErasePalette}
	 * @param {HTMLElement} target
	 */
	static #selectTerrain(_event, target) {
		const { terrainId } = target.dataset;

		const excludedTerrainTypeIds = eraseConfig$.excludedTerrainTypeIds$.value;

		eraseConfig$.excludedTerrainTypeIds$.value = excludedTerrainTypeIds.includes(terrainId)
			? excludedTerrainTypeIds.filter(id => id !== terrainId)
			: [...excludedTerrainTypeIds, terrainId];
	}

	/** @this {TerrainErasePalette} */
	static #selectAll() {
		eraseConfig$.excludedTerrainTypeIds$.value = [];
	}

	/** @this {TerrainErasePalette} */
	static #selectNone() {
		eraseConfig$.excludedTerrainTypeIds$.value = getTerrainTypes().map(t => t.id);
	}

	/** @this {TerrainErasePalette} */
	static #selectInverse() {
		const currentlySelected = new Set(eraseConfig$.excludedTerrainTypeIds$.value);
		const allTerrainTypes = getTerrainTypes().map(t => t.id);
		eraseConfig$.excludedTerrainTypeIds$.value = allTerrainTypes.filter(t => !currentlySelected.has(t));
	}

	/**
	 * @param {KeyboardEvent} event
	 * @param {number} min
	 */
	#getInputValue(event) {
		if (["", null, undefined].includes(event.currentTarget.value)) return null;
		const value = +event.currentTarget.value;
		return Math.max(isNaN(value) ? 0 : value, 0);
	}
}
