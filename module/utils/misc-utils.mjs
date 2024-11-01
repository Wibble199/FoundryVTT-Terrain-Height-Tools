import { moduleName, settings } from "../consts.mjs";

/**
 * Rounds the value to the nearest multiple of the given precision.
 * @param {number} value
 * @param {number} precision
 */
export function roundTo(value, precision) {
	return Math.round(value / precision) * precision;
}

/**
 * If the setting to use fractions is turned on, converts the number to use fractions where applicable.
 * @param {number} v
 * @returns {string}
 */
export function prettyFraction(v) {
	if (!game.settings.get(moduleName, settings.useFractionsForLabels))
		return v + "";

	const floored = Math.floor(v);
	switch (v % 1) {
		case 0.5: return (floored === 0 ? "" : floored) + "½";
		case 0.25: return (floored === 0 ? "" : floored) + "¼";
		case 0.75: return (floored === 0 ? "" : floored) + "¾";
		default: return v + "";
	}
}

/**
 * Converts a value between 0-1 to a two-digit hex number.
 * @param {number} a
 */
export function alphaToHex(a) {
	return Math.round(a * 255).toString(16).padStart(2, "0");
}

/**
 * A Set that can be iterated in order the items were added. When iterating, any additional items added to the set while
 * iterating over it will also be included in the current iterator.
 * @template T
 */
export class OrderedSet {

	/** @type {Set<T>} */
	#itemsSet = new Set();

	/** @type {T[]} */
	#itemsArray = [];

	/** @param {Iterable<T>} initialItems */
	constructor(initialItems = undefined) {
		this.addRange(initialItems);
	}

	/** @param {T} item */
	add(item) {
		if (this.#itemsSet.has(item)) return;

		this.#itemsSet.add(item);
		this.#itemsArray.push(item);
	}

	/** @param {Iterable<T> | undefined} items */
	addRange(items) {
		if (items)
			for (const item of items)
				this.add(item);
	}

	[Symbol.iterator]() {
		let index = 0;
		return {
			next: () => index < this.#itemsArray.length
				? { value: this.#itemsArray[index++], done: false }
				: { value: undefined, done: true }
		};
	}
}
