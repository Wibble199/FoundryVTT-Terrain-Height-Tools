/**
 * Returns a set of coordinates for the grid cell at the given position.
 * @param {number} row
 * @param {number} col
 * @returns {{ x: number; y: number }[]}
 */
export function getGridCellPolygon(row, col) {
	// Gridless is not supported
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

	// For hex grids, use the custom getHexPolyAligned function to generate them for us
	if (canvas.grid.isHexagonal) {
		// We round the x and y values, as this is what happens when a token's position is saved (happens because the
		// TokenDocument schema defines x and y as integers). If we didn't do this, there are occasionally tiny
		// intersections at corners when drawing token LoS due to the lack of rounding.
		const { x: ox, y: oy } = canvas.grid.getCenterPoint({ i: row, j: col });
		return canvas.grid.getShape().map(({ x: sx, y: sy }) => ({ x: Math.round(sx + ox), y: Math.round(sy + oy) }));
	}

	// Can get the points for a square grid easily
	const { x, y } = canvas.grid.getTopLeftPoint({ i: row, j: col });
	const { sizeX: w, sizeY: h } = canvas.grid;
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
 * Given a token, returns all the vertices of that token's border.
 * @param {Token} token
 * @returns {{ x: number; y: number; }[]}
 */
export function getGridVerticesFromToken(token) {
	// Gridless is not supported
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

	// For hex tokens, grab the vertices from getShape().points
	if (canvas.grid.isHexagonal) {
		// We round this off in an attempt to fix the issue where small intersections are detected when using the token
		// LoS tool. This doesn't completely fix the issue, but improves it. It seems to stem from TokenDocuments' x and
		// y properties being rounded.
		return pointArrayToObjects(token.getShape().points)
			.map(({ x, y }) => ({ x: Math.round(x + token.x), y: Math.round(y + token.y) }));
	}

	// For square grids, there are no points on getShape()
	const { x, y } = token.document;
	const { width: w, height: h } = token.getShape();

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

/**
 * Converts a value in from grid cells into scene units.
 * For example, if the canvas was set to 0.5, passing 3 to this function would return 1.5.
 * @template {number | null} T
 * @param {T} val
 * @returns {T extends number ? number : null}
 */
export function toSceneUnits(val) {
	return typeof val === "number"
		? val * canvas.scene.dimensions.distance
		: null;
}

/**
 * Converts a value in scene units into grid cells.
 * For example, if the canvas was set to 5ft, passing 10 to this function would return 2.
 * @template {number | null} T
 * @param {T} val
 * @returns {T extends number ? number : null}
 */
export function fromSceneUnits(val) {
	return typeof val === "number"
		? val / canvas.scene.dimensions.distance
		: null;
}

/**
 * Creates a function to adjusts the given hex cell offsets based on the current grid settings and given alt orientation
 * @param {[number, number]} anchor
 * @param {boolean} isAltOrientation
 * @returns {(offset: { x: number; y: number }) => { x: number; y: number }}
 */
function createAdjustHexCellOffsets([anchorX, anchorY], isAltOrientation) {

	// I wish I could describe more accurately what's going on here and why, but it basically just involved a lot of
	// trial and error. Good luck and god bless if anyone needs to make any adjustments in future.

	const isColumnar = [CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(canvas.grid.type);
	const isGridEven = [CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXEVENR].includes(canvas.grid.type);

	return ({ x: offsetX, y: offsetY }) => {
		// Swap offsets for columnar grids
		if (isColumnar)
			[offsetX, offsetY] = [offsetY, offsetX];

		// Account for token alternate orientations
		if (isColumnar && isAltOrientation)
			offsetY *= -1;
		else if (!isColumnar && isAltOrientation)
			offsetX *= -1;

		// Even/odd rows offset differently, so account for that
		if (isColumnar && Math.abs(offsetY % 2) === 1 && Math.abs(anchorY % 2) === (isGridEven ? 1 : 0))
			offsetX--;
		else if (!isColumnar && Math.abs(offsetX % 2) === 1 && Math.abs(anchorX % 2) === (isGridEven ? 1 : 0))
			offsetY--;

		return { x: anchorX + offsetX, y: anchorY + offsetY };
	};
}
