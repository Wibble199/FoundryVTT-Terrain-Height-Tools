import { render } from "lit";

/**
 * @template {!(new (...args: any[]) => any)} T
 * @param {T} BaseClass
 */
export const LitApplicationMixin = BaseClass => class extends BaseClass {

	/** @type {AbortController | undefined} */
	#closeController;

	/** @type {{ hookName: string; hookId: number; }[]} */
	#hooksToDispose = [];

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

		for (const { hookName, fn } of this.#hooksToDispose)
			Hooks.off(hookName, fn);
		this.#hooksToDispose = [];

		super.close(...args);
	}

	/**
	 * Starts listening to a hook. When this application is closed, the hook is automatically "off"ed.
	 * Also returns a function that can be manually called to "off" the hook.
	 * @param {string} hookName
	 * @param {Function} fn
	 * @returns {() => void}
	 */
	onHook(hookName, fn) {
		const hookId = Hooks.on(hookName, fn);
		this.#hooksToDispose.push({ hookName, hookId });
		return () => {
			Hooks.off(hookName, fn);
			this.#hooksToDispose = this.#hooksToDispose.filter(h => h.hookName !== hookName || h.hookId !== hookId);
		};
	}
};
