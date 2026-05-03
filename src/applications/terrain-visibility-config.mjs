import { computed, html } from "@lit-labs/preact-signals";
import { classMap } from "lit/directives/class-map.js";
import { invisibleTerrainTypes$ } from "../stores/canvas.mjs";
import { setSceneTerrainTypeVisible, terrainTypes$ } from "../stores/terrain-types.mjs";
import { abortableSubscribe } from "../utils/signal-utils.mjs";
import { styleTerrainColor } from "./directives/style-terrain-color.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtApplicationPositionMixin } from "./mixins/tht-application-position-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

export class TerrainVisibilityConfig extends ThtApplicationPositionMixin(LitApplicationMixin(ApplicationV2)) {

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
		}
	};

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_renderHTML() {
		return html`
			<p class="flex0" style="margin-top: 0; font-size: 0.95em;">
				${game.i18n.localize("TERRAINHEIGHTTOOLS.ClickToShowHideTerrain")}
			</p>
			<ul class="terrain-type-palette">
				${terrainTypes$.value.map(terrainType => html`
					<li
						class=${computed(() => classMap({ active: !invisibleTerrainTypes$.value.has(terrainType.id) }))}
						@click=${() => setSceneTerrainTypeVisible(canvas.scene, terrainType.id)}
					>
						<div class="preview-box" ${styleTerrainColor(terrainType, { textColorCssPropertyName: "" })}></div>
						<label class="terrain-type-name">${terrainType.name}</label>
					</li>
				`)}
			</ul>
		`;
	}

	_onFirstRender(...args) {
		super._onFirstRender(...args);
		abortableSubscribe(terrainTypes$, () => this.render(), this.closeSignal);
	}
}
