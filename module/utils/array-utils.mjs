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
 * Checks if the given cell exists within the array.
 * @param {[number, number][]} cells
 * @param {number} row
 * @param {number} col
 */
export function cellExists(cells, row, col) {
	return cells.some(cell => cell[0] === row && cell[1] === col);
}
