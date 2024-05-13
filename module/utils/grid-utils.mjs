/**
 * Returns a set of coordinates for the grid cell at the given position.
 * @param {number} row
 * @param {number} col
 * @returns {{ x: number; y: number }[]}
 */
export function getGridCellPolygon(row, col) {
	// Gridless is not supported
	if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

	const [x, y] = game.canvas.grid.grid.getPixelsFromGridPosition(row, col);

	// For hex grids, can use the getPolygon function to generate them for us
	if (game.canvas.grid.isHex) {
		const pointsFlat = game.canvas.grid.grid.getPolygon(x, y)
		const polygon = [];
		for (let i = 0; i < pointsFlat.length; i += 2) {
			polygon.push({ x: pointsFlat[i], y: pointsFlat[i + 1] });
		}
		return polygon;
	}

	// Can get the points for a square grid easily
	const { w, h } = game.canvas.grid;
	return [
		{ x, y },
		{ x: x + w, y },
		{ x: x + w, y: y + h },
		{ x, y: y + h },
	];
}
