import { cacheReturn } from "./misc-utils.mjs";

/** The side length of a hexagon with a grid size of 1 (apothem of 0.5). */
export const HEX_UNIT_SIDE_LENGTH = 1 / Math.sqrt(3);

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

const getSquareTokenSpaces = cacheReturn(
	/**
	 * Calculates the coordinates of spaces underneath a square token.
	 * @param {number} width
	 * @param {number} height
	 */
	function(width, height) {
		/** @type {{ x: number; y: number; }[]} */
		const spaces = [];

		for (let x = 0; x < width; x++)
		for (let y = 0; y < height; y++)
			spaces.push({ x: x + 0.5, y: y + 0.5 });

		return spaces;
	}
);

const getEllipseHexTokenSpaces = cacheReturn(
	/**
	 * Calculates the cube coordinates of all spaces occupied by an ellipse token with the given width/height.
	 * @param {number} primaryAxisSize Size of the token in the primary direction, measured in cells.
	 * @param {number} secondaryAxisSize Size of the token in the secondary direction, measured in cells.
	 * @param {boolean} isColumnar true for hex columns, false for hex rows.
	 * @param {boolean} isVariant2 false for ELLIPSE_1, true for ELLIPSE_2.
	 */
	function(primaryAxisSize, secondaryAxisSize, isColumnar, isVariant2) {
		// Ellipses require the size in primary axis to be at least as big as `floor(secondaryAxisSize / 2) + 1`.
		// E.G. for columnar grids, for a width of 5, the height must be 3 or higher. For a width of 6, height must be
		// at least 4 or higher. Same is true for rows, but in the opposite axis.
		if (primaryAxisSize < Math.floor(secondaryAxisSize / 2) + 1) {
			return [];
		}

		const secondaryAxisOffset = Math[isVariant2 ? "ceil" : "floor"]((secondaryAxisSize - 1) / 2) * HEX_UNIT_SIDE_LENGTH * 1.5 + HEX_UNIT_SIDE_LENGTH;

		/** @type {{ x: number; y: number; }[]} */
		const spaces = [];

		// Track the offset distance from the largest part of the hex (in primary), and which side we're on.
		// The initial side we use (sign) depends on the variant of ellipse we're building.
		let offsetDist = 0;
		let offsetSign = isVariant2 ? 1 : -1;

		for (let i = 0; i < secondaryAxisSize; i++) {
			const primaryAxisOffset = (offsetDist + 1) / 2;
			const secondaryPosition = offsetDist * offsetSign * HEX_UNIT_SIDE_LENGTH * 1.5 + secondaryAxisOffset;

			// The number of spaces in this primary axis decreases by 1 each time the offsetDist increases by 1: at the
			// 0 (the largest part of the shape), we have the full primary size number of cells. Either side of this, we
			// have primary - 1, either side of those primary - 2, etc.
			for (let j = 0; j < primaryAxisSize - offsetDist; j++) {
				spaces.push(coordinate(j + primaryAxisOffset, secondaryPosition));
			}

			// Swap over the offset side, and increase dist if neccessary
			offsetSign *= -1;
			if (i % 2 === 0) offsetDist++;
		}

		return spaces;

		/**
		 * @param {number} primary
		 * @param {number} secondary
		 */
		function coordinate(primary, secondary) {
			return isColumnar ? { x: secondary, y: primary } : { x: primary, y: secondary };
		}
	}
);

const getTrapezoidHexTokenSpaces = cacheReturn(
	/**
	 * Calculates the cube coordinates of all spaces occupied by an trapezoid token with the given width/height.
	 * @param {number} primaryAxisSize Size of the token in the primary direction, measured in cells.
	 * @param {number} secondaryAxisSize Size of the token in the secondary direction, measured in cells.
	 * @param {boolean} isColumnar true for hex columns, false for hex rows.
	 * @param {boolean} isVariant2 false for TRAPEZOID_1, true for TRAPEZOID_2.
	 */
	function(primaryAxisSize, secondaryAxisSize, isColumnar, isVariant2) {
		// For trapezoid to work, the size in the primary axis must be equal to or larger than the size in the secondary
		if (primaryAxisSize < secondaryAxisSize) {
			return [];
		}

		const secondaryAxisOffset = isVariant2 ? HEX_UNIT_SIDE_LENGTH + (secondaryAxisSize - 1) * HEX_UNIT_SIDE_LENGTH * 1.5 : HEX_UNIT_SIDE_LENGTH;

		/** @type {{ x: number; y: number; }[]} */
		const spaces = [];

		// Trazpezoids are simple. Start with a line in the primary direction that is the full primary size.
		// Then, for each cell in the secondary direction, reduce the primary by one.
		// If we are doing variant1 we offset in the secondary by one direction, for variant2 we go the other direction.
		for (let i = 0; i < secondaryAxisSize; i++) {
			const primaryAxisOffset = (i + 1) / 2;
			const secondaryPosition = i * (isVariant2 ? -1 : 1) * HEX_UNIT_SIDE_LENGTH * 1.5 + secondaryAxisOffset;

			for (let j = 0; j < primaryAxisSize - i; j++) {
				spaces.push(coordinate(j + primaryAxisOffset, secondaryPosition));
			}
		}

		return spaces;

		/**
		 * @param {number} primary
		 * @param {number} secondary
		 */
		function coordinate(primary, secondary) {
			return isColumnar ? { x: secondary, y: primary } : { x: primary, y: secondary };
		}
	}
);

const getRectangleHexTokenSpaces = cacheReturn(
	/**
	 * Calculates the cube coordinates of all spaces occupied by an trapezoid token with the given width/height.
	 * @param {number} primaryAxisSize Size of the token in the primary direction, measured in cells.
	 * @param {number} secondaryAxisSize Size of the token in the secondary direction, measured in cells.
	 * @param {boolean} isColumnar true for hex columns, false for hex rows.
	 * @param {boolean} isVariant2 false for TRAPEZOID_1, true for TRAPEZOID_2.
	 */
	function(primaryAxisSize, secondaryAxisSize, isColumnar, isVariant2) {
		// If the size in the primary direction is 1, the size in the secondary direction must be no more than one.
		// For primary size >= 2, any size secondary is acceptable.
		if (primaryAxisSize === 1 && secondaryAxisOffset > 1) {
			return [];
		}

		/** @param {{ x: number; y: number; }[]} */
		const spaces = [];

		const largeRemainder = isVariant2 ? 1 : 0;

		// Spaces under rectangles are easy. They just alternate size in the primary direction by 0 and -1 as we iterate
		// through the cells in the secondary direction.
		for (let i = 0; i < secondaryAxisSize; i++) {
			const isLarge = i % 2 === largeRemainder;
			for (let j = 0; j < primaryAxisSize - (isLarge ? 0 : 1); j++) {
				spaces.push(coordinate(
					j + (isLarge ? 0.5 : 1),
					i * HEX_UNIT_SIDE_LENGTH * 1.5 + HEX_UNIT_SIDE_LENGTH));
			}
		}

		return spaces;

		/**
		 * @param {number} primary
		 * @param {number} secondary
		 */
		function coordinate(primary, secondary) {
			return isColumnar ? { x: secondary, y: primary } : { x: primary, y: secondary };
		}
	}
);

/**
 * @param {number} x Token X.
 * @param {number} y Token Y.
 * @param {number} width Token width (in grid spaces).
 * @param {number} height Token height (in grid spaces).
 * @param {number} gridType The type of grid.
 * @param {number} gridSize The size of the grid in pixels.
 * @param {number} hexShape For hexagonal tokens, the type of hex shape used.
 */
export function getSpacesUnderToken(x, y, width, height, gridType, gridSize, hexShape) {
	// Gridless is not supported
	if (gridType === CONST.GRID_TYPES.GRIDLESS) {
		return [];
	}

	// For square, can easily work the points out by enumerating over the width/height
	if (gridType === CONST.GRID_TYPES.SQUARE) {
		return getSquareTokenSpaces(width, height)
			.map(p => ({ x: x + p.x * gridSize, y: y + p.y * gridSize }));
	}

	// For hex grids, it depends on the token's hex shape:
	// Hex grids are also rotationally equivalent (i.e. for a hex row we can just swap X and Y from a hex column).
	// We define a "primary" axis (the direction in the namesake of the grid - i.e. Y/height for columns and X/width for
	// rows). The "secondary" axis is the other (X/height for columns, Y/height for rows).
	const isColumnar = [CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(gridType);
	const primaryAxisSize = isColumnar ? height : width;
	const secondaryAxisSize = isColumnar ? width : height;
	const isVariant2 = [
		CONST.TOKEN_HEXAGONAL_SHAPES.ELLIPSE_2,
		CONST.TOKEN_HEXAGONAL_SHAPES.TRAPEZOID_2,
		CONST.TOKEN_HEXAGONAL_SHAPES.RECTANGLE_2
	].includes(hexShape);

	switch (hexShape) {
		case CONST.TOKEN_HEXAGONAL_SHAPES.ELLIPSE_1:
		case CONST.TOKEN_HEXAGONAL_SHAPES.ELLIPSE_2:
			return getEllipseHexTokenSpaces(primaryAxisSize, secondaryAxisSize, isColumnar, isVariant2)
				.map(p => ({ x: x + p.x * gridSize, y: y + p.y * gridSize }));

		case CONST.TOKEN_HEXAGONAL_SHAPES.TRAPEZOID_1:
		case CONST.TOKEN_HEXAGONAL_SHAPES.TRAPEZOID_2:
			return getTrapezoidHexTokenSpaces(primaryAxisSize, secondaryAxisSize, isColumnar, isVariant2)
				.map(p => ({ x: x + p.x * gridSize, y: y + p.y * gridSize }));

		case CONST.TOKEN_HEXAGONAL_SHAPES.RECTANGLE_1:
		case CONST.TOKEN_HEXAGONAL_SHAPES.RECTANGLE_2:
			return getRectangleHexTokenSpaces(primaryAxisSize, secondaryAxisSize, isColumnar, isVariant2)
				.map(p => ({ x: x + p.x * gridSize, y: y + p.y * gridSize }));

		default:
			throw new Error("Unknown hex grid type.");
	}
}
