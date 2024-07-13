import { moduleName } from "../consts.mjs";
import { Signal } from "../utils/signal.mjs";

export class TokenLineOfSightConfig extends Application {

	/** @type {(() => void)[]} */
	#subscriptions = [];

	/** @type {Signal<1 | 2 | undefined>} */
	#selectingToken$ = new Signal(undefined);

	/** @type {Token | undefined} */
	#hoveredToken = undefined;

	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("TERRAINHEIGHTTOOLS.TokenLineOfSightConfigTitle"),
			id: "tht_tokenLineOfSightConfig",
			classes: [...(super.defaultOptions.classes ?? []), "terrain-height-tool-window"],
			template: `modules/${moduleName}/templates/token-line-of-sight-config.hbs`,
			width: 300
		});
	}

	/** @type {import("../layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer} */
	get #losLayer() {
		return canvas.terrainHeightLosRulerLayer;
	}

	/** Whether or not the user is currently selecting a token. */
	get _isSelecting() {
		return typeof this.#selectingToken$.value === "number";
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		// Since there is no hook for selecting a token (and players cannot select tokens they don't own anyways), we
		// instead listen to the hover hook, and then detect when a mouse down has happened.
		// Not sure if there's a better way to do this, but it seems to work.
		Hooks.on("hoverToken", this.#onTokenHover);

		this.#subscriptions.forEach(unsubscribe => unsubscribe());

		this.#subscriptions = [
			this.#losLayer._rulerIncludeNoHeightTerrain$.subscribe(v =>
				html.find("[name='rulerIncludeNoHeightTerrain']").prop("checked", v), true),

			this.#selectingToken$.subscribe(v =>
				html.find(".token-selection-container").each((_, el) => {
					// Note must NOT return a value, because returning a falsey value terminates the jQuery each loop
					el.classList.toggle("is-selecting-token", v === +el.dataset.tokenIndex);
				}),
				true),

			this.#losLayer._token1$.subscribe(token =>
				this.#updateTokenDisplay(token, html.find(".token-selection-container[data-token-index='1']")), true),

			this.#losLayer._token2$.subscribe(token =>
				this.#updateTokenDisplay(token, html.find(".token-selection-container[data-token-index='2']")), true),
		];

		// Select token buttons
		html.find("[data-action='select']").on("click", this.#beginSelectToken.bind(this));

		// Clear buttons
		html.find("[data-action='clear']").on("click", this.#clearSelectedToken.bind(this));

		// Include flat terrain
		html.find("[name='rulerIncludeNoHeightTerrain']").on("change", e => {
			this.#losLayer._rulerIncludeNoHeightTerrain$.value = e.target.checked ?? false
		});
	}

	/**
	 * @param {Token | undefined} token
	 * @param {jQuery} target
	 */
	#updateTokenDisplay(token, target) {
		target.find(".token-name")
			.text(token?.name ?? game.i18n.localize("TERRAINHEIGHTTOOLS.NoTokenSelected"));

		target.find(".token-image")
			.attr("src", token?.document.texture?.src)
			.css("visibility", token?.document.texture?.src ? "visible" : "hidden");
	}

	/**
	 * @param {MouseEvent} event
	 */
	#beginSelectToken(event) {
		const tokenIndex = +event.currentTarget.closest("[data-token-index]").dataset.tokenIndex;
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
		const otherToken = this.#losLayer[`_token${tokenIndex === 1 ? 2 : 1}$`].value;

		if (otherToken === token) {
			ui.notifications.error(game.i18n.localize("TERRAINHEIGHTTOOLS.SameTokenSelected"));
			return;
		}

		this.#losLayer[`_token${tokenIndex}$`].value = token;
		this.#selectingToken$.value = undefined;
	}

	/**
	 * @param {MouseEvent} event
	 */
	#clearSelectedToken(event) {
		const tokenIndex = +event.currentTarget.closest("[data-token-index]").dataset.tokenIndex;
		this.#losLayer[`_token${tokenIndex}$`].value = undefined;
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
		this.#losLayer._token1$.value = undefined;
		this.#losLayer._token2$.value = undefined;

		// If waiting for user to select a token, stop
		this.#selectingToken$.value = undefined;

		this.#subscriptions.forEach(unsubscribe => unsubscribe());
		this.#subscriptions = [];

		return super.close(options);
	}
}
