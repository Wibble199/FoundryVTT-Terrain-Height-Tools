/**
 * @template T
 * @typedef {Object} SignalLike
 * @property {T} value
 * @property {(callback: (value: T) => void, immediate?: boolean) => (() => void)} subscribe
 * @property {(callback: (value: T) => void) => void} unsubscribe
 * @property {() => void} unsubscribeAll
 */

/**
 * A Signal represents a value that can be subscribed to, to be notified when its value changes.
 * @template T
 * @implements {Subscribable<T>}
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

	unsubscribeAll() {
		this.#subscriptions.clear();
		this.#afterLastUnsubscribe?.();
	}
}

/**
 * Subscribes to multiple Signals, and calls the given callback when any of them change.
 * The current values of the subscriptions are passed to the callback in the order passed to this method.
 * @template {any[]} U
 * @param {(...values: U) => void} callback The callback to invoke when any of the Signals' values change.
 * @param {{ [K in keyof U]: SignalLike<U[K]> }} signals The Signals to subscribe to.
 * @returns A function used to unsubscribe from all signals.
 */
export function join(callback, ...signals) {
	const joinedCallback = () => callback(...signals.map(s => s.value));
	signals.forEach(s => s.subscribe(joinedCallback, false));
	return () => signals.forEach(s => s.unsubscribe(joinedCallback));
}

/**
 * Creates a Signal that monitors the specified Foundry Hook for changes.
 * @param {string} hookName The name of the Foundry Hook.
 * @param {(...params: any[]) => boolean} [filter] If provided, only events that meet this filter will be forwarded.
 * @returns {Signal}
 */
export function fromHook(hookName, filter) {
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

/**
 * @template T
 * @typedef {SignalLike<T> & { [K in keyof T as `${K}$`]: T[K] extends Record<string, any> ? DeepSignal<T[K]> : Signal<T[K]> }} DeepSignal
 */
/**
 * Creates a deep Signal from the given object. Individual properties and the object as a whole can be subscribed to.
 * Any child properties that are themselves objects are also turned into deep Signals.
 *
 * Notes:
 * - When setting the value of DeepSignal, it is treated like a diff/`Object.assign` rather than a complete override.
 * - Once created, it is not possible to add or remove properties from a DeepSignal.
 * @template {Record<string, any>} T
 * @param {T} source
 * @returns {DeepSignal<T>}
 */
export function fromObject(source) {
	const signals = Object.fromEntries(
		Object.entries(source).map(([key, value]) => [
			key,
			typeof value === "object" && !Array.isArray(value)
				? fromObject(value)
				: new Signal(value)
			]
		)
	);

	/** @type {T} */
	let cachedValue;
	let supressUpdates = false;

	/** @type {Set<(value: T) => void>} */
	const subscriptions = new Set();

	function getValue() {
		return Object.fromEntries(
		Object.entries(signals).map(([key, signal]) => [key, signal.value]));
	}

	function childSubscription(_) {
		if (supressUpdates) return;
		cachedValue = getValue();
		subscriptions.forEach(s => s(cachedValue));
	}

	return new Proxy({
		get value() {
			// If there are subscriptions active, then the cachedValue will be up to date. Otherwise, it might be stale.
			return subscriptions.size > 0 ? cachedValue : getValue()
		},

		/** @param {Partial<T>} value */
		set value(value) {
			supressUpdates = true;
			Object.entries(value).forEach(([key, value]) => signals[key].value = value);
			supressUpdates = false;

			cachedValue = getValue();
			subscriptions.forEach(s => s(cachedValue));
		},

		subscribe(callback, immediate = false) {
			if (subscriptions.size === 0) {
				Object.values(signals).forEach(s => s.subscribe(childSubscription));
				cachedValue = getValue();
			}

			subscriptions.add(callback);
			if (immediate) callback(cachedValue);
			return () => this.unsubscribe(callback);
		},
		unsubscribe(callback) {
			subscriptions.delete(callback);

			if (subscriptions.size === 0) {
				Object.values(signals).forEach(s => s.unsubscribe(childSubscription));
			}
		},
		unsubscribeAll() {
			subscriptions.clear();
			Object.values(signals).forEach(s => s.unsubscribe(childSubscription));
		}
	}, {
		get(target, prop) {
			return prop.endsWith("$") && prop.slice(0, -1) in signals ? signals[prop.slice(0, -1)] : target[prop];
		}
	});
}
