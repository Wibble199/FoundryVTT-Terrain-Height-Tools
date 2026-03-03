import { moduleName, tokenRelativeHeights } from "../consts.mjs";
import { includeNoHeightTerrain$, tokenLineOfSightConfig$ } from "../stores/line-of-sight.mjs";
import { fromHook, Signal } from "../utils/signal.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TokenLineOfSightConfig extends withSubscriptions(HandlebarsApplicationMixin(ApplicationV2)) {

	/** @type {Signal<1 | 2 | undefined>} */
	#selectingToken$ = new Signal(undefined);

	/** @type {Token | undefined} */
	#hoveredToken = undefined;

	static DEFAULT_OPTIONS = {
		id: "tht_tokenLineOfSightConfig",
		window: {
			title: "TERRAINHEIGHTTOOLS.TokenLineOfSightConfigTitle",
			icon: "fas fa-compass-drafting",
			contentClasses: ["terrain-height-tool-window"]
		},
		position: {
			width: 300
		},
		actions: {
			selectToken: TokenLineOfSightConfig.#beginSelectToken,
			setHeight: TokenLineOfSightConfig.#setTokenRelativeHeight,
			clearToken: TokenLineOfSightConfig.#clearSelectedToken
		}
	};

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/token-line-of-sight-config.hbs`
		}
	};

	/** Whether or not the user is currently selecting a token. */
	get _isSelecting() {
		return typeof this.#selectingToken$.value === "number";
	}

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_onRender() {
		this._unsubscribeFromAll();

		this._subscriptions = [
			// Since there is no hook for selecting a token (and players cannot select tokens they don't own anyways),
			// we instead listen to the hover hook, and then detect when a mouse down has happened.
			// Not sure if there's a better way to do this, but it seems to work.
			fromHook("hoverToken").subscribe(this.#onTokenHover),

			includeNoHeightTerrain$.subscribe(v =>
				this.element.querySelector("[name='rulerIncludeNoHeightTerrain']").checked = v, true),

			this.#selectingToken$.subscribe(v =>
				this.element.querySelectorAll(".token-selection-container").forEach(el =>
					el.classList.toggle("is-selecting-token", v === +el.dataset.tokenIndex)), true),

			tokenLineOfSightConfig$.token1$.subscribe(token =>
				this.#updateTokenDisplay(token, this.element.querySelector(".token-selection-container[data-token-index='1']")), true),

			tokenLineOfSightConfig$.h1$.subscribe(height =>
				this.#updateTokenHeightButton(height, this.element.querySelector("[data-token-index='1'] [data-action='setHeight']")), true),

			tokenLineOfSightConfig$.token2$.subscribe(token =>
				this.#updateTokenDisplay(token, this.element.querySelector(".token-selection-container[data-token-index='2']")), true),

			tokenLineOfSightConfig$.h2$.subscribe(height =>
				this.#updateTokenHeightButton(height, this.element.querySelector("[data-token-index='2'] [data-action='setHeight']")), true)
		];

		// Include zones
		this.element.querySelector("[name='rulerIncludeNoHeightTerrain']").addEventListener("change", e =>
			includeNoHeightTerrain$.value = e.target.checked ?? false);
	}

	/**
	 * @param {Token | undefined} token
	 * @param {HTMLElement} target The container element whose children to update.
	 */
	#updateTokenDisplay(token, target) {
		target.querySelector(".token-name")
			.textContent = token?.name ?? game.i18n.localize("TERRAINHEIGHTTOOLS.NoTokenSelected");

		const tokenImage = target.querySelector(".token-image");
		tokenImage.src = token?.document.texture?.src ?? "";
		tokenImage.style.visibility = token?.document.texture?.src ? "visible" : "hidden";
	}

	/**
	 * @param {import("../consts.mjs").tokenRelativeHeights} height
	 * @param {HTMLElement} target The button element whose tooltip and icon to update.
	 */
	#updateTokenHeightButton(height, target) {
		// Update tooltip
		const tooltipText = game.i18n.format(
			"TERRAINHEIGHTTOOLS.TokenLineOfSightRelativeRayPosition",
			{ current: game.i18n.localize(tokenRelativeHeights[height]) });
		target.dataset.tooltip = tooltipText;

		// If the tooltip is currently being shown to the user, we need to re-activate it so that the tooltip updates
		if (game.tooltip.element === target)
			game.tooltip.activate(game.tooltip.element);

		// Update chevron icon
		const icon = {
			[1]: "fa-chevron-up",
			[0.5]: "fa-minus",
			[0]: "fa-chevron-down"
		}[height];
		target.querySelector("i").className = `fa ${icon}`;
	}

	/**
	 * @this {TokenLineOfSightConfig}
	 * @param {HTMLElement} target
	 */
	static #beginSelectToken(_event, target) {
		const tokenIndex = +target.closest("[data-token-index]").dataset.tokenIndex;
		this.#selectingToken$.value = this.#selectingToken$.value === tokenIndex ? undefined : tokenIndex;

		if (this.#selectingToken$.value)
			ui.notifications.info(game.i18n.localize("TERRAINHEIGHTTOOLS.TokenLineOfSightSelectTokenHint"));
	}

	// Called via libWrapper on Token.prototype._onClickLeft
	/**
	 * @param {Token} token
	 */
	_onSelectToken(token) {
		if (!this._isSelecting) return;

		const tokenIndex = this.#selectingToken$.value;
		const otherToken = tokenLineOfSightConfig$[`token${tokenIndex === 1 ? 2 : 1}$`].value;

		if (otherToken === token) {
			ui.notifications.error(game.i18n.localize("TERRAINHEIGHTTOOLS.SameTokenSelected"));
			return;
		}

		tokenLineOfSightConfig$[`token${tokenIndex}$`].value = token;
		this.#selectingToken$.value = undefined;
	}

	/**
	 * @this {TokenLineOfSightConfig}
	 * @param {HTMLElement} target
	 */
	static #setTokenRelativeHeight(_event, target) {
		const tokenIndex = target.closest("[data-token-index]").dataset.tokenIndex;
		const signal = tokenLineOfSightConfig$[`h${tokenIndex}$`];

		signal.value = {
			[1]: 0.5,
			[0.5]: 0,
			[0]: 1
		}[signal.value] ?? 1;
	}

	/**
	 * @this {TokenLineOfSightConfig}
	 * @param {HTMLElement} target
	 */
	static #clearSelectedToken(_event, target) {
		const tokenIndex = +target.closest("[data-token-index]").dataset.tokenIndex;
		tokenLineOfSightConfig$[`token${tokenIndex}$`].value = undefined;
		this.#selectingToken$.value = undefined;
	}

	#onTokenHover = (token, isHovered) => {
		if (isHovered) this.#hoveredToken = token;
		else if (this.#hoveredToken === token) this.#hoveredToken = undefined;
	};

	/** @override */
	close(options) {
		Hooks.off("hoverToken", this.#onTokenHover);

		// Clear the selection and the ruler on close
		tokenLineOfSightConfig$.value = {
			token1: undefined,
			token2: undefined
		};

		// If waiting for user to select a token, stop
		this.#selectingToken$.value = undefined;

		this._unsubscribeFromAll();

		return super.close(options);
	}
}
