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
 * Returns distinct items in the array according to the given functions.
 * The value returned from each function will be used in a Set, so ensure it implements value equality.
 * The order of the returned items is not guaranteed or stable.
 * @template T
 * @param {T[]} items
 * @param  {...((item: T) => any)} funcs
 * @returns {T[]}
 */
export function distinctBy(items, ...funcs) {
	if (!funcs?.length) throw new Error("Must provide at least one function");

	// Create a map that holds each key against either: another map (when it isn't at max depth) or a value (if it is)
	const distinct = new Map();

	for (const item of items) {
		const keys = funcs.map(f => f(item));
		let map = distinct;
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];

			// None last key should work it's way down the map heirarchy
			if (i < keys.length - 1) {
				map.set(key, map.get(key) ?? new Map());
				map = map.get(key);

			// Last key should, if one has not already been found, add this item into the leaf node
			} else if (!map.has(key)) {
				map.set(key, item);
			}
		}
	}

	// Recursively flatten the maps to just get the leaf values
	const flatten = value => value instanceof Map ? [...value.values()].flatMap(flatten) : value;
	return flatten(distinct);
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
