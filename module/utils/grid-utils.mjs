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
 * @param {Token} token
 * @returns {{ x: number; y: number; }[]}
 */
export function getGridVerticesFromToken(token) {
	// Gridless is not supported
	if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

	/** @type {TokenDocument} */
	const { x, y, width, height } = token.document;

	// For hex grids, use the getBorderPolygon method
	if (game.canvas.grid.isHex) {
		const pointsFlat = game.modules.get("hex-size-support")?.api?.isAltOrientation(token) === true
			? canvas.grid.grid.getAltBorderPolygon(width, height, 0)
			: canvas.grid.grid.getBorderPolygon(width, height, 0);
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

/**
 * Converts a value in from grid cells into scene units.
 * For example, if the canvas was set to 0.5, passing 3 to this function would return 1.5.
 * @template {number | null} T
 * @param {T} val
 * @returns {T extends number ? number : null}
 */
export function toSceneUnits(val) {
	return typeof val === "number"
		? val * game.canvas.scene.dimensions.distance
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
		? val / game.canvas.scene.dimensions.distance
		: null;
}

/**
 * Returns an array of grid cells underneath the given token poisition.
 * If the token does not lie exactly on a cell (i.e. it's not snapped), then the closest cells will be returned.
 * When working with hex grids, does not support tokens larger than size 4.
 * @param {{ x: number; y: number; width: number; height: number; }} position
 * @param {boolean} isAltOrientation Hex size support module alt orientation flag.
 * @returns {{ x: number; y: number; }[]}
 */
export function getCellsUnderTokenPosition(position, isAltOrientation) {
	// Gridless: (not supported)
	if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

	// Square grids:
	if (!game.canvas.grid.isHex) {
		const topLeftCell = game.canvas.grid.grid.getGridPositionFromPixels(
			position.x + game.canvas.grid.grid.w / 2,
			position.y + game.canvas.grid.grid.h / 2);

		const tokenCells = [];
		for (let xOffset = 0; xOffset < position.width; xOffset++)
		for (let yOffset = 0; yOffset < position.height; yOffset++)
			tokenCells.push({ x: topLeftCell[0] + xOffset, y: topLeftCell[1] + yOffset });

		return tokenCells;
	}

	// Hex grids:
	/** @type {{ width: number; }} */
	const { width: size } = position;

	// Tokens above size 4 aren't supported
	if (size > 4) return [];

	// If HSS is not enabled, size 2 hex tokens seem to behave as alt orientation?
	if (size === 2 && game.modules.get("hex-size-support")?.active !== true)
		isAltOrientation = true;

	// Find the center of the token
	// This will be our "anchor" cell, which, for sizes > 1, other cells will be added around it
	const tokenRect = game.canvas.grid.grid.getRect(position.width, position.height);
	const tokenAnchorCellPosPx = {
		x: position.x + tokenRect.width / 2,
		y: position.y + tokenRect.height / 2
	};

	// If the token is even-sized (2 or 4), then it has no central cell so we can offset the "anchor" cell.
	// The exact direction we need to offset it by is dependant on whether it's using the alternate orientation.
	if (size % 2 === 0) {
		// Center Y will actually not lie on a vertex exactly, but half the height of the sloped part of the hex.
		// So, the amount we need to move is 0.5 * 0.75 * `h` or `w` (true height/width of the cells).
		// FOR POINTY HEXES: if alt orientation, move up, otherwise move down
		// FOR FLAT HEXES: if alt orientation, move left, otherwise right
		const isColumnar = [CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(game.canvas.grid.type);
		if (isColumnar)
			tokenAnchorCellPosPx.x += (0.375 * game.canvas.grid.grid.w) * (isAltOrientation ? -1 : 1);
		else
			tokenAnchorCellPosPx.y += (0.375 * game.canvas.grid.grid.h) * (isAltOrientation ? -1 : 1);
	}

	/** @type {[number, number]} */
	const tokenAnchorCellPosGc = game.canvas.grid.grid.getGridPositionFromPixels(tokenAnchorCellPosPx.x, tokenAnchorCellPosPx.y);

	const tokenCells = [{ x: tokenAnchorCellPosGc[0], y: tokenAnchorCellPosGc[1] }];

	// Grow the tokens based on the token size:
	const adjustHexCellOffsets = createAdjustHexCellOffsets(tokenAnchorCellPosGc, isAltOrientation);
	if (size >= 2) {
		tokenCells.push(...[
			{ x: -1, y: 0 },
			{ x: -1, y: 1 }
		].map(adjustHexCellOffsets));
	}

	if (size >= 3) {
		tokenCells.push(...[
			{ x: 0, y: -1 },
			{ x: 0, y: 1 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 }
		].map(adjustHexCellOffsets));
	}

	if (size >= 4) {
		tokenCells.push(...[
			{ x: -1, y: -1 },
			{ x: -2, y: -1 },
			{ x: -2, y: 0 },
			{ x: -2, y: 1 },
			{ x: -1, y: 2 },
		].map(adjustHexCellOffsets));
	}

	return tokenCells;
}

/**
 * Returns an array of grid cells underneath the given token.
 * If the token does not lie exactly on a cell (i.e. it's not snapped), then the closest cells will be returned.
 * When working with hex grids, does not support tokens larger than size 4.
 * @param {Token} token
 */
export function getCellsUnderToken(token) {
	return getCellsUnderTokenPosition(token.document, game.modules.get("hex-size-support")?.api?.isAltOrientation(token) === true);
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

	const isColumnar = [CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(game.canvas.grid.type);
	const isGridEven = [CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXEVENR].includes(game.canvas.grid.type);

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
