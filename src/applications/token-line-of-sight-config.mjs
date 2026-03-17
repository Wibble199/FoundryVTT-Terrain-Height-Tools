/** @import { Signal } from "@preact/signals-core" */
import { html } from "@lit-labs/preact-signals";
import { computed, signal } from "@preact/signals-core";
import { classMap } from "lit/directives/class-map.js";
import { createRef, ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { tokenRelativeHeights } from "../consts.mjs";
import { includeNoHeightTerrain$, tokenLineOfSightConfig$ } from "../stores/line-of-sight.mjs";
import { abortableSubscribe } from "../utils/signal-utils.mjs";
import { LitApplicationMixin } from "./lit-application-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TokenLineOfSightConfig extends LitApplicationMixin(ApplicationV2) {

	/** @type {Signal<1 | 2 | undefined>} */
	#selectingToken$ = signal(undefined);

	_isSelectingToken$ = computed(() => typeof this.#selectingToken$.value === "number");

	/** @type {Token | undefined} */
	#hoveredToken = undefined;

	/** @type {number | undefined} */
	#hoverTokenHookId;

	static DEFAULT_OPTIONS = {
		id: "tht_tokenLineOfSightConfig",
		window: {
			title: "TERRAINHEIGHTTOOLS.TokenLineOfSightConfigTitle",
			icon: "fas fa-compass-drafting",
			contentClasses: ["terrain-height-tool-window"]
		},
		position: {
			width: 300
		}
	};

	/** @type {TokenLineOfSightConfig | undefined} */
	static current;

	constructor(...args) {
		super(...args);
		current = this;
	}

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_renderHTML() {
		return html`
			<p style="margin-top: 0">${l("TERRAINHEIGHTTOOLS.TokenLineOfSightConfigHint")}</p>

			${this.#renderTokenPicker(1, tokenLineOfSightConfig$.token1, tokenLineOfSightConfig$.h1)}

			${this.#renderTokenPicker(2, tokenLineOfSightConfig$.token2, tokenLineOfSightConfig$.h2)}

			<label>
				<input
					type="checkbox"
					name="rulerIncludeNoHeightTerrain"
					.checked=${includeNoHeightTerrain$}
					@change=${e => includeNoHeightTerrain$.value = e.target.checked}>
				${l("TERRAINHEIGHTTOOLS.IncludeZones")}
			</label>
		`;
	}

	/**
	 * @param {number} idx
	 * @param {Signal<Token | undefined>} token$
	 * @param {Signal<number>} height$
	 */
	#renderTokenPicker(idx, token$, height$) {
		const tokenName$ = computed(() => token$.value?.name ?? l("TERRAINHEIGHTTOOLS.NoTokenSelected"));
		const tokenImageSrc$ = computed(() => token$.value?.document.texture?.src ?? "");
		const tokenImageStyle$ = computed(() => styleMap({ visibility: tokenImageSrc$.value ? "visible" : "hidden" }));

		const heightButtonRef = createRef();

		const heightButtonTooltip$ = computed(() => game.i18n.format(
			"TERRAINHEIGHTTOOLS.TokenLineOfSightRelativeRayPosition",
			{ current: game.i18n.localize(tokenRelativeHeights[height$.value]) }
		));

		// After rendering the height button, if the tooltip is currently being shown to the user, we need to
		// re-activate it so that the tooltip updates
		abortableSubscribe(heightButtonTooltip$, () => Promise.resolve().then(() => {
			if (game.tooltip.element === heightButtonRef.value)
				game.tooltip.activate(game.tooltip.element);
		}, 0), this.closeSignal);

		const heightButtonIconClass$ = computed(() => ({
			[1]: "fas fa-chevron-up",
			[0.5]: "fas fa-minus",
			[0]: "fas fa-chevron-down"
		}[height$]));

		return html`
			<div class=${computed(() => classMap({
				"token-selection-container": true,
				"is-selecting-token": this.#selectingToken$.value === idx
			}))}>
				<img
					class="token-image"
					src=${tokenImageSrc$}
					style=${tokenImageStyle$}
				>
				<span class="token-name">${tokenName$}</span>
				<a
					class="token-action"
					data-tooltip=${l("TERRAINHEIGHTTOOLS.SelectToken")}
					@click=${() => this.#beginSelectToken(idx)}
				>
					<i class="fas fa-bullseye-pointer"></i>
				</a>
				<a
					class="token-action"
					data-tooltip=${heightButtonTooltip$}
					@click=${() => height$.value = (height$.value + 0.5) % 1.5}
					${ref(heightButtonRef)}
				>
					<i class=${heightButtonIconClass$} style="width:20px"></i>
				</a>
				<a
					class="token-action"
					data-tooltip=${l("TERRAINHEIGHTTOOLS.ClearSelectedToken")}
					@click=${() => this.#clearSelectedToken(token$)}
				>
					<i class="fas fa-xmark"></i>
				</a>
			</div>
		`;
	}

	/** @override */
	_onFirstRender(...args) {
		super._onFirstRender(...args);
		this.#hoverTokenHookId = this.onHook("hoverToken", (...args) => this.#onTokenHover(...args));
	}

	/** @override */
	close(options) {
		// Clear the selection and the ruler on close
		tokenLineOfSightConfig$.value = {
			token1: undefined,
			token2: undefined
		};

		// If waiting for user to select a token, stop
		this.#selectingToken$.value = undefined;

		Hooks.off("hoverToken", this.#hoverTokenHookId);

		return super.close(options);
	}

	/** @param {number} tokenIndex */
	#beginSelectToken(tokenIndex) {
		this.#selectingToken$.value = this.#selectingToken$.value === tokenIndex ? undefined : tokenIndex;

		if (this.#selectingToken$.value)
			ui.notifications.info(game.i18n.localize("TERRAINHEIGHTTOOLS.TokenLineOfSightSelectTokenHint"));
	}

	// Called via libWrapper on Token.prototype._onClickLeft
	/** @param {Token} token */
	_onSelectToken(token) {
		if (typeof this.#selectingToken$.value !== "number") return;

		const [selectingToken$, otherToken$] = this.#selectingToken$.value === 1
			? [tokenLineOfSightConfig$.token1, tokenLineOfSightConfig$.token2]
			: [tokenLineOfSightConfig$.token2, tokenLineOfSightConfig$.token1];

		if (otherToken$.value === token) {
			ui.notifications.error(game.i18n.localize("TERRAINHEIGHTTOOLS.SameTokenSelected"));
			return;
		}

		selectingToken$.value = token;
		this.#selectingToken$.value = undefined;
	}

	/** @param {Signal<Token | undefined>} token$ */
	#clearSelectedToken(token$) {
		token$.value = undefined;
		this.#selectingToken$.value = undefined;
	}

	#onTokenHover(token, isHovered) {
		if (isHovered) this.#hoveredToken = token;
		else if (this.#hoveredToken === token) this.#hoveredToken = undefined;
	}
}
