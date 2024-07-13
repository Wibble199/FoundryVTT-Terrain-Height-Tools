/**
 * Returns a set of coordinates for the grid cell at the given position.
 * @param {number} row
 * @param {number} col
 * @returns {{ x: number; y: number }[]}
 */
export function getGridCellPolygon(row, col) {
	// Gridless is not supported
	if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

	// For hex grids, use the custom getHexPolyAligned function to generate them for us
	if (game.canvas.grid.isHex) {
		const pointsFlat = getHexPolyAligned(row, col);
		return pointArrayToObjects(pointsFlat);
	}

	// Can get the points for a square grid easily
	const [x, y] = game.canvas.grid.grid.getPixelsFromGridPosition(row, col);
	const { w, h } = game.canvas.grid;
	return [
		{ x, y },
		{ x: x + w, y },
		{ x: x + w, y: y + h },
		{ x, y: y + h },
	];
}

/**
 * Returns a the coordinates of the center of the grid cell at the given position.
 * @param {number} row
 * @param {number} col
 * @returns {{ x: number; y: number }}
 */
export function getGridCenter(row, col) {
	return getGridCellPolygon(row, col)
		.reduce((acc, cur, idx) => ({
			x: acc.x + (cur.x - acc.x) / (idx + 1),
			y: acc.y + (cur.y - acc.y) / (idx + 1)
		}));
}

/**
 * Foundry's default hex grid implementation does not perfectly align the vertices of the grid polygons: It is within
 * a few tenths of a pixel, which looks fine visually but causes rounding and snapping problems with the LOS calcs.
 * So this method creates hex polygons of the given size in a way that makes the vertices align perfectly.
 * @param {number} row The row of the cell whose vertices to get (in grid coordinates).
 * @param {number} col The column of the cell whose vertices to get (in grid coordinates).
 * @param {PointArray[]} [points] An optional array of polygon points.
 * @returns {number[]}
 */
function getHexPolyAligned(row, col, points = undefined) {
	const grid = canvas.grid.grid;
	const gridPos = HexagonalGrid.offsetToPixels({ row, col }, grid.options);
	const rightGridPos = HexagonalGrid.offsetToPixels({ row, col: col + 1 }, grid.options);
	const belowGridPos = HexagonalGrid.offsetToPixels({ row: row + 1, col }, grid.options);

	switch (canvas.grid.type) {
		// Pointy top
		case CONST.GRID_TYPES.HEXODDR:
		case CONST.GRID_TYPES.HEXEVENR:
			return grid.getPolygon(gridPos.x, gridPos.y, rightGridPos.x - gridPos.x, (belowGridPos.y - gridPos.y) / 0.75, points);

		// Flat top
		case CONST.GRID_TYPES.HEXODDQ:
		case CONST.GRID_TYPES.HEXEVENQ:
			return grid.getPolygon(gridPos.x, gridPos.y, (rightGridPos.x - gridPos.x) / 0.75, belowGridPos.y - gridPos.y, points);

		// Gridless/square
		default:
			throw new Error(`Given grid type (${type}) is not a hex grid.`);
	}
}

/**
 * Given a token, returns all the vertices of that token's border.
 * @param {Token | TokenDocument} token
 * @returns {{ x: number; y: number; }[]}
 */
export function getGridVerticesFromToken(token) {
	// Gridless is not supported
	if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

	/** @type {TokenDocument} */
	const tokenDoc = token instanceof TokenDocument ? token : token.document;
	const { x, y, width, height } = tokenDoc;

	// For hex grids, use the getBorderPolygon method
	if (game.canvas.grid.isHex) {
		// TODO: add support for the Hex Size Support module if it's installed
		const pointsFlat = canvas.grid.grid.getBorderPolygon(width, height, 0);
		return pointArrayToObjects(pointsFlat, x, y);
	}

	// Can get the vertices for a square grid easily
	const w = width * game.canvas.grid.w, h = height * game.canvas.grid.h;
	return [
		{ x: x, y: y },
		{ x: x + w, y: y },
		{ x: x + w, y: y + h },
		{ x: x, y: y + h },
	];
}

/**
 * Takes a flat point array and converts it into an array of objects.
 * @param {number[]} arr
 * @param {number} [xOffset]
 * @param {number} [yOffset]
 * @returns {{ x: number; y: number; }[]}
 */
function pointArrayToObjects(arr, xOffset = 0, yOffset = 0) {
	const points = [];
	for (let i = 0; i < arr.length; i += 2)
		points.push({ x: arr[i] + xOffset, y: arr[i + 1] + yOffset });
	return points;
}
