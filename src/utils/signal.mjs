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
 * @implements {SignalLike<T>}
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

	#equalityComparer;

	/**
	 * @param {T} initialValue
	 * @param {Object} [options]
	 * @param {boolean} [options.onlyFireWhenChanged]
	 * @param {() => void} [options.beforeFirstSubscribe] Callback that runs before the first subscriber is added.
	 * @param {() => void} [options.afterLastUnsubscribe] Callback that runs after the last subscriber is removed.
	 * @param {(a: T, b: T) => boolean} [options.equalityComparer] Function to determine if a value has changed (used
	 * when `onlyFireWhenChanged` is true).
	 */
	constructor(initialValue, { onlyFireWhenChanged = true, beforeFirstSubscribe, afterLastUnsubscribe, equalityComparer } = {}) {
		this.#value = initialValue;
		this.onlyFireWhenChanged = onlyFireWhenChanged;
		this.#beforeFirstSubscribe = beforeFirstSubscribe;
		this.#afterLastUnsubscribe = afterLastUnsubscribe;
		this.#equalityComparer = equalityComparer ?? ((a, b) => a === b);
	}

	get value() {
		return this.#value;
	}

	set value(newValue) {
		if (this.onlyFireWhenChanged && this.#equalityComparer(newValue, this.#value))
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
 * @typedef {SignalLike<T> & { [K in keyof T as `${K}$`]: T[K] extends Record<string, {}> ? DeepSignal<T[K]> : Signal<T[K]> }} DeepSignal
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
			typeof value === "object" && value !== null && !Array.isArray(value)
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
			Object.entries(value).forEach(([key, value]) => {
				if (signals[key])
					signals[key].value = value
			});
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

/**
 * A specialised signal that behaves like a Set, but allows subscribing to the value.
 * @template TElement
 * @implements {SignalLike<Iterable<TElement>>}
 */
export class SetSignal {

	/** @type {Set<TElement>T} */
	#values;

	/** @type {Set<(value: Iterable<TElement>) => void>} */
	#changeSubscriptions = new Set();

	/** @type {Set<(newItems: TElement[]) => void>} */
	#itemAddedSubscriptions = new Set();

	/** @type {Set<(removedItems: TElement[]) => void>} */
	#itemRemovedSubscriptions = new Set();

	/**
	 * @param {Iterable<TElement>} [initialValues]
	 */
	constructor(initialValues) {
		this.#values = new Set(initialValues ?? []);
	}

	/** @type {Iterable<TElement>} */
	get value() {
		return [...this.#values.values()];
	}

	set value(newValues) {
		const newValuesSet = new Set(newValues ?? []);

		const newlyAddedValues = [];
		for (const newValue of newValuesSet)
			if (!this.#values.has(newValue))
				newlyAddedValues.push(newValue);

		const removedValues = [];
		for (const oldValue of this.#values)
			if (!newValuesSet.has(oldValue))
				removedValues.push(oldValue);

		// If no values have been added or removed, the set is unchanged
		if (newlyAddedValues.length === 0 && removedValues.length === 0) return;

		this.#values = newValuesSet;
		this.#notifySubscribers({ newValues: newlyAddedValues, removedValues });
	}

	get size() {
		return this.#values.size;
	}

	/**
	 * Adds one or more items to the set.
	 * @param {...TElement} values
	 * @returns true if any of the given values were added to the set, or false if they all already exist.
	 */
	add(...values) {
		const newValues = [];

		for (const value of values) {
			if (this.#values.has(value)) continue;

			this.#values.add(value);
			newValues.push(value);
		}

		this.#notifySubscribers({ newValues });
		return newValues.length > 0;
	}

	/**
	 * @param {...TElement} values
	 * @returns true if any of the values have been removed from the set, or false if all values did not exist.
	 */
	delete(...values) {
		const removedValues = [];

		for (const value of values) {
			if (this.#values.delete(value))
				removedValues.push(value);
		}

		this.#notifySubscribers({ removedValues });
		return removedValues.length > 0;
	}

	clear() {
		if (this.#values.size === 0) return;

		const deletedValues = [...this.#values.values()];
		this.#values.clear();

		for (const callback of this.#changeSubscriptions)
			callback([]);

		for (const callback of this.#itemRemovedSubscriptions)
			callback(deletedValues)
	}

	/** @param {TElement} value */
	has(value) {
		return this.#values.has(value);
	}

	/**
	 * Registers the given callback as a subscription, so that it is called when the values in this SetSignal change.
	 * @param {((value: Iterable<T>) => void) | { change?: (value: Iterable<T>) => void; add?: (newItems: TElement[]) => void; remove?: (removedItems: TElement[]) => void; }} callback Function to call when the value changes.
	 * @param {boolean} [immediate] If `true`, immediately calls the callback with the current value.
	 * @returns A function that can be called to unsubscribe this callback.
	 */
	subscribe(callback, immediate = false) {
		if (typeof callback === "function") {
			this.#changeSubscriptions.add(callback);
			if (immediate) callback(this.value);
		} else {
			if (typeof callback.change === "function") this.subscribe(callback.change, immediate);
			if (typeof callback.add === "function") this.subscribeAdd(callback.add);
			if (typeof callback.remove === "function") this.subscribeRemove(callback.remove);
		}
		return () => this.unsubscribe(callback);
	}

	/**
	 * Registers the given callback to be called whenever items are added to the set.
	 * @param {(newItems: TElement[]) => void} callback
	 * @returns A function that can be called to unsubscribe this callback.
	 */
	subscribeAdd(callback) {
		this.#itemAddedSubscriptions.add(callback);
	}

	/**
	 * Registers the given callback to be called whenever item are removed from the set.
	 * @param {(removedItems: TElement[]) => void} callback
	 * @returns A function that can be called to unsubscribe this callback.
	 */
	subscribeRemove(callback) {
		this.#itemRemovedSubscriptions.add(callback);
	}

	/**
	 * Unregisters the given callback, stopping it from being called when the values in this SetSignal change.
	 * @param {((value: Iterable<T>) => void) | { change?: (value: Iterable<T>) => void; add?: (newItems: TElement[]) => void; remove?: (removedItems: TElement[]) => void; }} callback The callback that was subscribed to this Signal.
	 */
	unsubscribe(callback) {
		if (typeof callback === "function") {
			this.#changeSubscriptions.delete(callback);
		} else {
			if (typeof callback.change === "function") this.unsubscribe(callback.change);
			if (typeof callback.add === "function") this.unsubscribeAdd(callback.add);
			if (typeof callback.remove === "function") this.unsubscribeRemove(callback.remove);
		}
	}

	/**
	 * Unregisters the given callback, stopping it from being called when values are added to this SetSignal.
	 * @param {(newItems: TElement[]) => void} callback The callback that was subscribed to this Signal.
	 */
	unsubscribeAdd(callback) {
		this.#itemAddedSubscriptions.delete(callback);
	}

	/**
	 * Unregisters the given callback, stopping it from being called when values are removed from this SetSignal.
	 * @param {(removedItems: TElement[]) => void} callback The callback that was subscribed to this Signal.
	 */
	unsubscribeRemove(callback) {
		this.#itemRemovedSubscriptions.delete(callback);
	}

	unsubscribeAll() {
		this.#changeSubscriptions.clear();
		this.#itemAddedSubscriptions.clear();
		this.#itemRemovedSubscriptions.clear();
	}

	/** @param {{ newValues?: TElement[]; removedValues?: TElement[]; }} changes */
	#notifySubscribers({ newValues, removedValues } = {}) {
		if (newValues?.length > 0 || removedValues?.length > 0)
			for (const callback of this.#changeSubscriptions)
				callback(this.value);

		if (newValues?.length > 0)
			for (const callback of this.#itemAddedSubscriptions)
				callback(newValues);

		if (removedValues?.length > 0)
			for (const callback of this.#itemRemovedSubscriptions)
				callback(removedValues);
	}
}
