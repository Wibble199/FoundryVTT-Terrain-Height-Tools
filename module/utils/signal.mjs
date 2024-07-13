/**
 * A Signal represents a value that can be subscribed to, to be notified when its value changes.
 * @template T
 */
export class Signal {

	/** @type {T} */
	#value;

	/** @type {Set<(value: T) => void>} */
	#subscriptions = new Set();

	/** @type {(() => void) | undefined} */
	#beforeFirstSubscribe = undefined;

	/** @type {(() => void) | undefined} */
	#afterLastUnsubscribe = undefined;

	/**
	 * @param {T} initialValue
	 * @param {Object} [options]
	 * @param {boolean} [options.onlyFireWhenChanged]
	 * @param {() => void} [options.beforeFirstSubscribe] Callback that runs before the first subscriber is added.
	 * @param {() => void} [options.afterLastUnsubscribe] Callback that runs after the last subscriber is removed.
	 */
	constructor(initialValue, { onlyFireWhenChanged = true, beforeFirstSubscribe, afterLastUnsubscribe } = {}) {
		this.#value = initialValue;
		this.onlyFireWhenChanged = onlyFireWhenChanged;
		this.#beforeFirstSubscribe = beforeFirstSubscribe;
		this.#afterLastUnsubscribe = afterLastUnsubscribe;
	}

	get value() {
		return this.#value;
	}

	set value(newValue) {
		if (this.onlyFireWhenChanged && newValue === this.#value)
			return;

		this.#value = newValue;

		for (const callback of this.#subscriptions.values())
			callback(newValue);
	}

	/**
	 * Registers the given callback as a subscription, so that it is called when the value of this Signal changes.
	 * @param {(value: T) => void} callback Function to call when the value changes.
	 * @param {boolean} [immediate] If `true`, immediately calls the callback with the current value.
	 * @returns A function that can be called to unsubscribe this callback.
	 */
	subscribe(callback, immediate = false) {
		if (this.#subscriptions.size === 0)
			this.#beforeFirstSubscribe?.();

		this.#subscriptions.add(callback);
		if (immediate) callback(this.#value);
		return () => this.unsubscribe(callback);
	}

	/**
	 * Unregisters the given callback, stopping it from being called when the value of this Signal changes.
	 * @param {(value: T) => void} callback The callback that was subscribed to this Signal.
	 */
	unsubscribe(callback) {
		this.#subscriptions.delete(callback);

		if (this.#subscriptions.size === 0)
			this.#afterLastUnsubscribe?.();
	}

	/**
	 * Subscribes to multiple Signals, and calls the given callback when any of them change.
	 * The current values of the subscriptions are passed to the callback in the order passed to this method.
	 * @param {(...values: any[]) => void} callback The callback to invoke when any of the Signals' values change.
	 * @param {...Signal<any>} signals The Signals to subscribe to.
	 * @returns A function used to unsubscribe from all signals.
	 */
	static join(callback, ...signals) {
		const joinedCallback = () => callback(...signals.map(s => s.value));
		signals.forEach(s => s.subscribe(joinedCallback, false));
		return () => signals.forEach(s => s.unsubscribe(joinedCallback));
	}

	/**
	 * Creates a Signal that monitors the specified Foundry Hook for changes.
	 * @param {string} hookName The name of the Foundry Hook.
	 * @param {(...params: any[]) => boolean} [filter] If provided, only events that meet this filter will be forwarded.
	 * @returns
	 */
	static fromHook(hookName, filter) {
		const hookHandler = (...params) => {
			if (typeof filter !== "function" || filter(...params))
				signal.value = params;
		};

		const signal = new Signal(undefined, {
			onlyFireWhenChanged: false,
			beforeFirstSubscribe: () => Hooks.on(hookName, hookHandler),
			afterLastUnsubscribe: () => Hooks.off(hookName, hookHandler)
		});

		return signal;
	}
}
