/** @template T */
export class Observable {

	/**
	 * @type {Set<(value: T) => void>}
	 * @protected
	 */
	_subscriptions = new Set();

	/** @protected */
	get _hasSubscribers() {
		return this._subscriptions.size > 0;
	}

	/**
	 * Gets the value passed to subscribers.
	 * @returns {T}
	 * @protected
	 * @abstract
	 */
	_getValue() {
		throw new Error("This needs to be implemented by derived type.");
	}

	/**
	 * Notifies all subscribers of a change.
	 * @protected
	 */
	_notify() {
		for (const callback of this._subscriptions.values())
			callback(this._getValue());
	}

	/**
	 * Registers the given callback as a subscription, so that it is called when the value of this Signal changes.
	 * @param {(value: T) => void} callback Function to call when the value changes.
	 * @param {boolean} [immediate] If `true`, immediately calls the callback with the current value.
	 * @returns A function that can be called to unsubscribe this callback.
	 */
	subscribe(callback, immediate = false) {
		if (this._subscriptions.size === 0)
			this._beforeFirstSubscribe();

		this._subscriptions.add(callback);
		if (immediate) callback(this._getValue());
		return () => this.unsubscribe(callback);
	}

	/**
	 * Unregisters the given callback, stopping it from being called when the value of this Signal changes.
	 * @param {(value: T) => void} callback The callback that was subscribed to this Signal.
	 */
	unsubscribe(callback) {
		this._subscriptions.delete(callback);

		if (this._subscriptions.size === 0)
			this._afterLastUnsubscribe();
	}

	/** @protected */
	_beforeFirstSubscribe() {}

	/** @protected */
	_afterLastUnsubscribe() {}

	/**
	 * Creates a new Observable from this Observable which maps the result from this Observable onto a new result.
	 * The result is shared (the function will only be executed once per value, regardless of number of subscribers).
	 * @template U
	 * @param {(value: T) => U} func
	 * @returns {Observable<U>}
	 */
	map(func) {
		return new MappedObservable(this, func);
	}

	/**
	 * @template {any[]} T
	 * @param {{ [K in keyof T]: Observable<T[K]> }} childObservables
	 * @returns {Observable<T>}
	 */
	static join(...childObservables) {
		return new JoinedObservable(childObservables);
	}
}

/**
 * A Signal represents a value that can be subscribed to, to be notified when its value changes.
 * @template T
 * @extends {Observable<T>}
 */
export class Signal extends Observable {

	/** @type {T} */
	#value;

	/** @type {(() => void) | undefined} */
	#beforeFirstSubscribe;

	/** @type {(() => void) | undefined} */
	#afterLastUnsubscribe;

	/**
	 * @param {T} initialValue
	 * @param {Object} [options]
	 * @param {boolean} [options.onlyFireWhenChanged]
	 * @param {() => void} [options.beforeFirstSubscribe] Callback that runs before the first subscriber is added.
	 * @param {() => void} [options.afterLastUnsubscribe] Callback that runs after the last subscriber is removed.
	 */
	constructor(initialValue, { onlyFireWhenChanged = true, beforeFirstSubscribe, afterLastUnsubscribe } = {}) {
		super();

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

		super._notify();
	}

	/** @override */
	_getValue() {
		return this.#value;
	}

	_beforeFirstSubscribe() {
		this.#beforeFirstSubscribe?.();
	}

	_afterLastUnsubscribe() {
		this.#afterLastUnsubscribe?.();
	}

	/**
	 * Creates a Signal that monitors the specified Foundry Hook for changes.
	 * @template {any[]} T
	 * @param {string} hookName The name of the Foundry Hook.
	 * @param {(...params: T) => boolean} [filter] If provided, only events that meet this filter will be forwarded.
	 * @returns {Signal<T>}
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

	/**
	 * Creates a Signal that monitors the specified game setting for changes.
	 * @template T Setting value type
	 * @param {string} settingNamespace
	 * @param {string} settingKey
	 * @returns {Signal<T>}
	 */
	static fromSetting(settingNamespace, settingKey) {
		const updateSettingHookHandler = (namespace, key, value) => {
			if (namespace === settingNamespace && key === settingKey)
				signal.value = value;
		};

		const signal = new Signal(game.settings.get(settingNamespace, settingKey), {
			onlyFireWhenChanged: false,
			beforeFirstSubscribe: () => Hooks.on("terrainHeightTools.updateSettings", updateSettingHookHandler),
			afterLastUnsubscribe: () => Hooks.off("terrainHeightTools.updateSettings", updateSettingHookHandler)
		});

		return signal;
	}
}

/**
 * A collection of Signals that can be dynamically added to or removed from.
 * Differs from `Observable.join` as this will also notify subscribers when an item is added or removed, unlike `join`
 * which cannot be altered once created.
 * @template T
 * @extends Observable<T[]>
 */
export class SignalSet extends Observable {

	/** @type {Set<Signal<T>>} */
	#signals = new Set();

	/** @param {Signal<T>[] | undefined} initialItems */
	constructor(initialItems) {
		super();

		if (initialItems?.length > 0)
			this.add(...initialItems);
	}

	/**
	 * Returns the current values in the Signals in this set.
	 */
	get values() {
		return this._getValue();
	}

	/**
	 * Gets the number of Signals in this SignalSet.
	 */
	get size() {
		return this.#signals.size;
	}

	/** @override */
	_getValue() {
		return [...this.#signals].map(s => s.value);
	}

	/**
	 * Adds a number of child Signals to this SignalSet.
	 * When adding multiple Signals in one call, subscribers will only be notified once.
	 * @param  {...Signal<T>} signals
	 */
	add(...signals) {
		const shouldNotify = signals.reduce((notify, signal) => {
			notify ||= !this.#signals.has(signal);
			this.#signals.add(signal);
			if (this._hasSubscribers) signal.subscribe(this.#notify);
			return notify;
		}, false) && this._hasSubscribers;

		if (shouldNotify) this.#notify();
	}

	/**
	 * Removes a number of child Signals to this SignalSet.
	 * @param  {...Signal<T>} signals
	 */
	delete(...signals) {
		const shouldNotify = signals.reduce((notify, signal) => {
			signal.unsubscribe(this.#notify);
			return this.#signals.delete(signal) || notify;
		}, false) && this._hasSubscribers;

		if (shouldNotify) this.#notify();
	}

	/**
	 * Determines if a Signal is in this SignalSet.
	 * @param {Signal<T>} signal
	 */
	has(signal) {
		return this.#signals.has(signal);
	}

	/**
	 * Removes all Signals from the collection.
	 */
	clear() {
		// Ensure that all Signals are unsubscribed from (won't cause issues if we're not actually subbed to them)
		this.#signals.forEach(s => s.unsubscribe(this.#notify));
		this.#signals.clear();
		if (this._hasSubscribers) this.#notify();
	}

	/** @override */
	_beforeFirstSubscribe() {
		this.#signals.forEach(s => s.subscribe(this.#notify));
	}

	/** @override */
	_afterLastUnsubscribe() {
		this.#signals.forEach(s => s.unsubscribe(this.#notify));
	}

	// Create a close and keep reference
	#notify = () => super._notify();

	[Symbol.iterator]() {
		return this.#signals[Symbol.iterator];
	}
}

/**
 * An Observable that maps the result from another Observable using a mapping function.
 * @template T Input type
 * @template U Projected type
 * @extends Observable<U>
 */
class MappedObservable extends Observable {

	/** @type {Observable<T>} */
	#source;

	/** @type {(value: T) => U} */
	#mapFunc;

	/** @type {U} */
	#value;

	/**
	 * @param {Observable<T>} source
	 * @param {(value: T) => U} map
	 */
	constructor(source, map) {
		super();
		this.#source = source;
		this.#mapFunc = map;
	}

	/** @param {T} value */
	#onSourceChange = value => {
		this.#value = this.#mapFunc(value);
		this._notify();
	};

	/** @override */
	_getValue() {
		return this.#value;
	}

	/** @override */
	_beforeFirstSubscribe() {
		this.#source.subscribe(this.#onSourceChange, true);
	}

	/** @override */
	_afterLastUnsubscribe() {
		this.#source.unsubscribe(this.#onSourceChange);
	}
}

/**
 * @template {any[]} T
 * @extends {Observable<T>}
 */
class JoinedObservable extends Observable {

	/** @type {{ [K in keyof T]: Observable<T[K]> }} */
	#children;

	/** @param {{ [K in keyof T]: Observable<T[K]> }} childObservables */
	constructor(childObservables) {
		super();
		this.#children = childObservables;
	}

	/** @returns {T} */
	_getValue() {
		return this.#children.map(c => c._getValue());
	}

	/** @override */
	_beforeFirstSubscribe() {
		this.#children.forEach(c => c.subscribe(this.#notify, true));
	}

	/** @override */
	_afterLastUnsubscribe() {
		this.#children.forEach(c => c.unsubscribe(this.#notify));
	}

	#notify = () => super._notify();
}
