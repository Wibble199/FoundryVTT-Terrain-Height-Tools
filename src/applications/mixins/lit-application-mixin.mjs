import { render } from "lit";

/**
 * @template {!(new (...args: any[]) => any)} T
 * @param {T} BaseClass
 */
export const LitApplicationMixin = BaseClass => class extends BaseClass {

	/** @type {AbortController | undefined} */
	#closeController;

	get closeSignal() {
		return this.#closeController.signal;
	}

	/** @override */
	_replaceHTML(templateResult, container) {
		render(templateResult, container);
	}

	/** @override */
	_preFirstRender(...args) {
		super._preFirstRender(...args);
		this.#closeController = new AbortController();
	}

	/** @override */
	close(...args) {
		this.#closeController.abort();
		super.close(...args);
	}
};
