import { moduleName } from "../consts.mjs";
import { eraseConfig$ } from "../stores/drawing.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { getTerrainTypes } from '../utils/terrain-types.mjs';
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

export class TerrainErasePalette extends withSubscriptions(Application) {

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.PaletteTitle"),
			id: "tht_terrainErasePalette",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/terrain-erase-palette.hbs`,
			scrollY: ["ul"],
			width: 220,
			height: 342,
			resizable: true
		});
	}

	/** @override */
	getData() {
		return {
			availableTerrains: getTerrainTypes().map(t => ({
				id: t.id,
				name: t.name,

				// Hex colors including opacity for preview boxes:
				previewBorderColor: t.lineWidth <= 0
					? "transparent"
					: t.lineColor + Math.round(t.lineOpacity * 255).toString(16).padStart(2, "0"),
				previewBackgroundColor: t.fillColor + Math.round(t.fillOpacity * 255).toString(16).padStart(2, "0"),
			}))
		};
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		this._unsubscribeFromAll();
		this._subscriptions = [
			eraseConfig$.excludedTerrainTypeIds$.subscribe(excludedTerrainTypeIds => {
				html.find("[data-terrain-id]").each((_, /** @type {HTMLElement} */ el) => {
					const isExcluded = excludedTerrainTypeIds.includes(el.dataset.terrainId);
					el.classList.toggle("active", !isExcluded);
				});
			}, true),

			eraseConfig$.bottom$.subscribe(bottom => {
				html.find("[name='bottom']").val(toSceneUnits(bottom));
				html.find("[name='top']").attr("min", toSceneUnits(bottom) ?? 0);
			}, true),

			eraseConfig$.top$.subscribe(top => {
				html.find("[name='top']").val(toSceneUnits(top));
				html.find("[name='bottom']").attr("max", toSceneUnits(top));
			}, true)
		];

		html.find("[data-terrain-id]").on("click", this.#onTerrainSelect.bind(this));

		html.find("[data-action='selectAll']").on("click", this.#onSelectAll.bind(this));
		html.find("[data-action='selectNone']").on("click", this.#onSelectNone.bind(this));
		html.find("[data-action='selectInverse']").on("click", this.#onSelectInverse.bind(this));

		// On input change, update the relevant Signal
		html.find("[name='bottom']").on("input", evt =>
			eraseConfig$.bottom$.value = fromSceneUnits(this.#getInputValue(evt)));

		html.find("[name='top']").on("input", evt =>
			eraseConfig$.top$.value = fromSceneUnits(this.#getInputValue(evt)));

		// On blur, ensure that the value is below/above the other value and then set the value of the input to the
		// Signal, so that if it was left as an invalid number it resets and shows the correct value again.
		html.find("[name='bottom']").on("blur", evt => {
			let { bottom, top } = eraseConfig$.value;
			if (typeof bottom === "number" && typeof top === "number" && bottom > top)
				bottom = eraseConfig$.bottom$.value = top;

			evt.currentTarget.value = toSceneUnits(bottom);
		});

		html.find("[name='top']").on("blur", evt => {
			let { bottom, top } = eraseConfig$.value;
			if (typeof bottom === "number" && typeof top === "number" && top < bottom)
				top = eraseConfig$.top$.value = bottom;

			evt.currentTarget.value = toSceneUnits(top);
		});
	}

	/** @param {MouseEvent} event */
	#onTerrainSelect(event) {
		const { terrainId } = event.currentTarget.dataset;

		const excludedTerrainTypeIds = eraseConfig$.excludedTerrainTypeIds$.value;

		eraseConfig$.excludedTerrainTypeIds$.value = excludedTerrainTypeIds.includes(terrainId)
			? excludedTerrainTypeIds.filter(id => id !== terrainId)
			: [...excludedTerrainTypeIds, terrainId];
	}

	#onSelectAll() {
		eraseConfig$.excludedTerrainTypeIds$.value = [];
	}

	#onSelectNone() {
		eraseConfig$.excludedTerrainTypeIds$.value = getTerrainTypes().map(t => t.id);
	}

	#onSelectInverse() {
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
