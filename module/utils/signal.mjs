/**
 * A Signal represents a value that can be subscribed to, to be notified when its value changes.
 * @template T
 */
export class Signal {

	/** @type {T} */
	#value;

	/** @type {Set<(value: T) => void>} */
	#subscriptions = new Set();

	/** @param {T} initialValue */
	constructor(initialValue) {
		this.#value = initialValue;
	}

	get value() {
		return this.#value;
	}

	set value(newValue) {
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
		this.#subscriptions.add(callback);
		if (immediate) callback(this.#value);
		return () => { this.#subscriptions.delete(callback); };
	}

	/**
	 * Unregisters the given callback, stopping it from being called when the value of this Signal changes.
	 * @param {(value: T) => void} callback The callback that was subscribed to this Signal.
	 */
	unsubscribe(callback) {
		this.#subscriptions.delete(callback);
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
}
