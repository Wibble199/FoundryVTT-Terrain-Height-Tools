/** @import { TerrainShape } from "../geometry/terrain-shape.mjs" */
/** @import { TerrainType } from "../stores/terrain-types.mjs" */
import { computed, effect } from "@preact/signals-core";
import { html, svg } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { when } from "lit/directives/when.js";
import { keyPressed$ } from "../config/keybindings.mjs";
import { showTerrainStackViewerOnTokenLayer$, terrainStackViewerDisplayMode$ } from "../config/settings.mjs";
import { keybindings, terrainHeightEditorControlName } from "../consts.mjs";
import { canvasReady$, cursorWorldPosition$ } from "../stores/canvas.mjs";
import { activeControl$ } from "../stores/scene-controls.mjs";
import { allTerrainShapes$, getShapesAtPoint } from "../stores/terrain-manager.mjs";
import { getCssColorsFor, getTerrainType } from "../stores/terrain-types.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";

// How many pixels each unit in height is represented by in proportional mode.
const proportionalModeScale = 28;

const proportionalModePadding = 1;

// How many pixels a 1-width border should be shown as in the SVG.
const proportionalModeBorderScale = 0.5;

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TerrainStackViewer extends LitApplicationMixin(ApplicationV2) {

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

	#terrainShapesUnderMouse$ = computed(() => {
		if (!canvasReady$.value) return [];

		// Reference the Signal in allTerrainShapes so that this computed re-calculates when that changes.
		// getShapesAtPoint uses the quadtree (which is not a signal), so does not create a dependency, but this does.
		// eslint-disable-next-line no-unused-vars
		const _ = allTerrainShapes$.value;

		const { x, y } = cursorWorldPosition$.value;
		return getShapesAtPoint(x, y);
	});

	// The stack viewer panel is visible when any of the following are true:
	// - The hotkey is being held down.
	// - The user is on the Terrain Height Tools toolbar
	// - The user is on the token layer, is hovering over a cell with terrain data, and has the option to
	//   show the toolbox on the token layer turned on.
	#isVisible$ = computed(() =>
		keyPressed$[keybindings.showTerrainStack].value ||
		activeControl$.value === terrainHeightEditorControlName ||
		(
			activeControl$.value === "token" &&
			showTerrainStackViewerOnTokenLayer$.value &&
			this.#terrainShapesUnderMouse$.value.length > 0
		));

	constructor() {
		super();

		effect(() => {
			const isVisible = this.#isVisible$.value;

			// Show/hide application window
			if (this.element)
				this.element.style.display = isVisible ? "block" : "none";

			// When terrain is changed, if we're drawing the stack viewer, update it
			// We track the terrainShapesUnderMouse$ signal in this effect so that the shape collision test is only run
			// when neccessary. If we were to subscribe to #terrainShapesUnderMouse$ instead, then it would always have
			// an active subscription and therefore would always be running the collision checks even if the viewer was
			// known to not be visible.
			if (isVisible) {
				// eslint-disable-next-line no-unused-vars
				const _ = this.#terrainShapesUnderMouse$.value;
				this.render();
			}
		});

		// When display mode setting is changed, re-render
		terrainStackViewerDisplayMode$.subscribe(() => {
			if (this.#isVisible$.value)
				this.render();
		});
	}

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_insertElement(element) {
		element.style.display = this.#isVisible$.value ? "block" : "none";
		const existing = document.getElementById(element.id);
		if (existing) existing.replaceWith(element);
		else document.getElementById("ui-bottom").prepend(element);
	}

	/** @override */
	_renderHTML() {
		const shapes = this.#terrainShapesUnderMouse$.value;

		if (shapes.length === 0) {
			return html`<p style="text-align: center;">${l("TERRAINHEIGHTTOOLS.HoverTerrainToShowDetails")}</p>`;
		}

		const shapesWithMeta = shapes.map(shape => {
			const terrainType = getTerrainType(shape.terrainTypeId);
			const style = getCssColorsFor(terrainType);
			return { shape, terrainType, style };
		});

		const nonZoneShapes = shapesWithMeta
			.filter(({ terrainType }) => terrainType.usesHeight)
			.sort((a, b) => b.shape.elevation - a.shape.elevation);

		const zoneShapes = shapesWithMeta
			.filter(({ terrainType }) => !terrainType.usesHeight)
			.sort((a, b) => a.terrainType.name.localeCompare(b.terrainType.name, undefined, { sensitivity: "accent" }));

		const highestElevation = nonZoneShapes.length
			? Math.max.apply(null, nonZoneShapes.map(({ shape }) => shape.top))
			: 0;

		const configuredDisplayMode = terrainStackViewerDisplayMode$.value;
		const isProportionalDisplayMode = configuredDisplayMode === "auto"
			? highestElevation <= 8
			: configuredDisplayMode === "proportional";

		return html`
			<!-- Non-zone shapes -->
			${isProportionalDisplayMode
				? this.#renderProportionalDisplay(nonZoneShapes, highestElevation)
				: this.#renderCompactDisplay(nonZoneShapes)}

			<!-- Separator -->
			${when(nonZoneShapes.length && zoneShapes.length, () => html`<hr>`)}

			<!-- Zones -->
			${zoneShapes.map(({ terrainType, style: { color, borderColor, background } }) => html`
				<div class="terrain-layer-block" style=${styleMap({ color, borderColor, background })}>
					<p class="terrain-layer-block-title">${terrainType.name}</p>
				</div>
			`)}
		`;
	}

	// TODO: how to handle case where multiple shapes with height overlap at same elevation (e.g. from a provider)?

	/**
	 * @param {{ shape: TerrainShape; terrainType: TerrainType; style: ReturnType<typeof getCssColorsFor>; }[]} shapes
	 * @param {number} highestElevation
	 */
	#renderProportionalDisplay(shapes, highestElevation) {
		const viewBoxY = ((highestElevation + 0.5) * -proportionalModeScale) - proportionalModePadding;
		const viewBoxH = ((highestElevation + 0.5) * proportionalModeScale) + (2 * proportionalModePadding);
		const viewBox = `0 ${viewBoxY} 230 ${viewBoxH}`;

		return html`
			<svg xmlns="http://www.w3.org/2000/svg" viewBox=${viewBox}>
				<!-- Vertical axis labels -->
				<line class="axis-line"
					x1="0%" y1="0"
					x2="100%" y2="0"
				/>

				${Array.from({ length: Math.ceil(highestElevation) }, (_, i) => svg`
					<line class="axis-line"
						x1="10%" y1=${(i + 1) * -proportionalModeScale}
						x2="95%" y2=${(i + 1) * -proportionalModeScale}
					/>
					<text class="axis-line-label"
						x="8%" y=${(i + 1) * -proportionalModeScale}
						text-anchor="end" dominant-baseline="middle"
					>
						${toSceneUnits(i + 1)}
					</text>
				`)}

				<!-- Shape blocks -->
				${shapes.map(({ shape, terrainType, style }) => svg`
					<rect
						x="15%" y=${(shape.top * -proportionalModeScale) + (style.borderWidth * proportionalModeBorderScale * 0.5) + proportionalModePadding}
						width="80%" height=${(shape.height * proportionalModeScale) + (style.borderWidth * -proportionalModeBorderScale) + (proportionalModePadding * -2)}
						fill=${style.background}
						stroke=${style.borderColor}
						stroke-width=${style.borderWidth * proportionalModeBorderScale}
					/>

					<text class="shape-label"
						x="55%" y=${(shape.elevation + (shape.height / 2)) * -proportionalModeScale}
						text-anchor="middle" dominant-baseline="middle"
						fill=${style.color}
					>
						${terrainType.name}
					</text>
				`)}
			</svg>
		`;
	}

	/** @param {{ shape: TerrainShape; terrainType: TerrainType; style: ReturnType<typeof getCssColorsFor>; }[]} shapes */
	#renderCompactDisplay(shapes) {
		const f = v => prettyFraction(toSceneUnits(v));
		return html`${shapes.map(({ shape, terrainType, style: { color, borderColor, background } }) => html`
			<div class="terrain-layer-block" style=${styleMap({ color, borderColor, background })}>
				<p class="terrain-layer-block-title">${terrainType.name}</p>
				<p class="terrain-layer-block-height">${f(shape.bottom)} → ${f(shape.bottom)} (${l("Height")} ${f(shape.height)})</p>
			</div>
		`)}`;
	}
}
