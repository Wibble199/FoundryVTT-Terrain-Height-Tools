/**
 * Groups the given items by a key selector function into a Map, where the key is the group key and the value is an
 * array of items within that group.
 * @template T
 * @template U
 * @param {T[]} items
 * @param {(item: T) => U} func
 * @returns {Map<U, T[]>}
 */
export function groupBy(items, func) {
	const groups = new Map();
	items.forEach(item => {
		const group = func(item);
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group).push(item);
	});
	return groups;
}

/**
 * Returns distinct items in the array according to the given function.
 * The value returned from the function will be used in a Set, so ensure it implements value equality.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => any} func
 * @returns {T[]}
 */
export function distinctBy(items, func) {
	const seen = new Set();
	const distinct = [];
	for (const item of items) {
		const key = func(item);
		if (seen.has(key)) continue;
		distinct.push(item);
		seen.add(key);
	}
	return distinct;
}

/**
 * Divides the given array into arrays containing a maximum of `chunkSize` items. The last sub-array may have fewer than
 * `chunkSize` items.
 * @template T
 * @param {T[]} items
 * @param {number} chunkSize
 * @returns {T[][]}
 */
export function chunk(items, chunkSize) {
	const arrays = [];
	for (let i = 0; i < items.length; i += chunkSize) {
		arrays.push(items.slice(i, i + chunkSize));
	}
	return arrays;
}

/**
 * Splits the array into two sub-arrays: one containing items that are truthy and items that are falsey according to the
 * given predicate function.
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => boolean} predicate
 * @returns {{ t: T[]; f: T[] }}
 * @example
 * const { t: even, f: odd } = filterSplit([1, 2, 3, 4], n => n % 2 === 0);
 */
export function filterSplit(items, predicate) {
	const truthy = [];
	const falsey = [];
	for (let i = 0; i < items.length; i++)
		(predicate(items[i], i) ? truthy : falsey).push(items[i]);
	return { t: truthy, f: falsey };
}
