/** @import { Signal } from "@preact/signals-core" */
import { signal } from "@preact/signals-core";

/**
 * @template TElement
 * @typedef {Object} ObservableSetObserver
 * @property {(values: Iterable<TElement>, newItems: TElement[], removedItems: TElement[]) => void} [change]
 * @property {(newItems: TElement[]) => void} [add]
 * @property {(removedItems: TElement[]) => void} [remove]
 */

/**
 * A specialised collection whose value is reactive and which will raise events when items are added or removed.
 * @template TElement
 */
export class ObservableSet {

	/** @type {Signal<Set<TElement>>} */
	#innerSet;

	/** @type {Set<ObservableSetObserver<TElement>>} */
	#observers = new Set();

	/**
	 * @param {Iterable<TElement>} [initialValues]
	 */
	constructor(initialValues) {
		this.#innerSet = signal(new Set(initialValues ?? []));
	}

	/** @type {Iterable<TElement>} */
	get value() {
		return [...this.#innerSet.value.values()];
	}

	set value(newValue) {
		const newValuesSet = new Set(newValue ?? []);

		const addedValues = [];
		for (const newValue of newValuesSet)
			if (!this.#innerSet.peek().has(newValue))
				addedValues.push(newValue);

		const removedValues = [];
		for (const oldValue of this.#innerSet.peek())
			if (!newValuesSet.has(oldValue))
				removedValues.push(oldValue);

		// If no values have been added or removed, the set is unchanged
		if (addedValues.length === 0 && removedValues.length === 0) return;

		this.#innerSet.value = newValuesSet;
		this.#notifySubscribers({ newValues: addedValues, removedValues });
	}

	get size() {
		return this.#innerSet.value.size;
	}

	/**
	 * Adds one or more items to the set.
	 * @param {...TElement} values
	 * @returns true if any of the given values were added to the set, or false if they all already exist.
	 */
	add(...values) {
		const newValues = [];
		const newSet = new Set(this.#innerSet.value);

		for (const value of values) {
			if (newSet.has(value)) continue;

			newSet.add(value);
			newValues.push(value);
		}

		if (newValues.length) this.#innerSet.value = newSet;
		this.#notifySubscribers({ newValues });
		return newValues.length > 0;
	}

	/**
	 * @param {...TElement} values
	 * @returns true if any of the values have been removed from the set, or false if all values did not exist.
	 */
	delete(...values) {
		const removedValues = [];
		const newSet = new Set(this.#innerSet.value);

		for (const value of values) {
			if (newSet.delete(value))
				removedValues.push(value);
		}

		if (removedValues.length) this.#innerSet.value = newSet;
		this.#notifySubscribers({ removedValues });
		return removedValues.length > 0;
	}

	clear() {
		if (this.#innerSet.value.size === 0) return;

		const removedValues = [...this.#innerSet.value];
		this.#innerSet.value = new Set();
		this.#notifySubscribers({ removedValues });
	}

	/** @param {TElement} value */
	has(value) {
		return this.#innerSet.value.has(value);
	}

	/**
	 * Registers the given observer, so that it is notified when the values in this ObservableSet change.
	 * @param {ObservableSetObserver<TElement>} observer Observer to be notified when changes to the collection are made.
	 * @param {Object} [options]
	 * @param {AbortSignal} [options.signal] If provided, will unsubscribe from this set when aborted.
	 * @returns A function that can be called to unsubscribe this observer.
	 */
	subscribe(observer, { signal } = {}) {
		this.#observers.add(observer);
		const unsubscribe = () => this.unsubscribe(observer);

		signal?.addEventListener("abort", unsubscribe, { once: true });

		return () => {
			unsubscribe();
			signal?.removeEventListener("abort", unsubscribe);
		};
	}

	/**
	 * Unregisters the given observer, stopping it from recieving notifications when values in this ObservableSet change.
	 * @param {ObservableSetObserver<TElement>} observer The observer that was subscribed to this Signal.
	 */
	unsubscribe(observer) {
		this.#observers.delete(observer);
	}

	unsubscribeAll() {
		this.#observers.clear();
	}

	/** @param {{ newValues?: TElement[]; removedValues?: TElement[]; }} changes */
	#notifySubscribers({ newValues = [], removedValues = [] } = {}) {
		if (newValues.length === 0 && removedValues.length === 0) return;

		for (const observer of this.#observers) {
			observer.change?.(this.#innerSet.peek().values(), newValues, removedValues);

			if (removedValues.length > 0)
				observer.remove?.(removedValues);

			if (newValues.length > 0)
				observer.add?.(newValues);
		}
	}
}
