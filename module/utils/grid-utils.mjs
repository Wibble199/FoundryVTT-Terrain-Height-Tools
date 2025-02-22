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
 * Returns an array of grid cells underneath the given token poisition.
 * If the token does not lie exactly on a cell (i.e. it's not snapped), then the closest cells will be returned.
 * When working with hex grids, does not support tokens larger than size 4.
 * @param {{ x: number; y: number; width: number; height: number; }} position
 * @param {boolean} isAltOrientation Hex size support module alt orientation flag.
 * @returns {{ x: number; y: number; }[]}
 */
export function getCellsUnderTokenPosition(position, isAltOrientation) {
	// Gridless: (not supported)
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

	// Square grids:
	if (!canvas.grid.isHexagonal) {
		const topLeftCell = canvas.grid.getOffset({
			x: position.x + canvas.grid.sizeX / 2,
			y: position.y + canvas.grid.sizeY / 2
		});

		const tokenCells = [];
		for (let xOffset = 0; xOffset < position.width; xOffset++)
		for (let yOffset = 0; yOffset < position.height; yOffset++)
			tokenCells.push({ x: topLeftCell.i + xOffset, y: topLeftCell.j + yOffset });

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
	const tokenRect = canvas.grid.grid.getRect(position.width, position.height);
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
		const isColumnar = [CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(canvas.grid.type);
		if (isColumnar)
			tokenAnchorCellPosPx.x += (0.375 * canvas.grid.sizeX) * (isAltOrientation ? -1 : 1);
		else
			tokenAnchorCellPosPx.y += (0.375 * canvas.grid.sizeY) * (isAltOrientation ? -1 : 1);
	}

	/** @type {{ i: number, j: number }} */
	const { i, j } = canvas.grid.getOffset({ x: tokenAnchorCellPosPx.x, y: tokenAnchorCellPosPx.y });

	const tokenCells = [{ x: i, y: j }];

	// Grow the tokens based on the token size:
	const adjustHexCellOffsets = createAdjustHexCellOffsets([i, j], isAltOrientation);
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
