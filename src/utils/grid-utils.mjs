import { Polygon } from "../geometry/polygon.mjs";
import { groupBy } from "./array-utils.mjs";
import { error, warn } from "./log.mjs";
import { cacheReturn, OrderedSet } from "./misc-utils.mjs";

/** The side length of a hexagon with a grid size of 1 (apothem of 0.5). */
const HEX_UNIT_SIDE_LENGTH = 1 / Math.sqrt(3);

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
		{ x, y: y + h }
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
			x: acc.x + ((cur.x - acc.x) / (idx + 1)),
			y: acc.y + ((cur.y - acc.y) / (idx + 1))
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
		{ x: x, y: y + h }
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

		const secondaryAxisOffset = (Math[isVariant2 ? "ceil" : "floor"]((secondaryAxisSize - 1) / 2) * HEX_UNIT_SIDE_LENGTH * 1.5) + HEX_UNIT_SIDE_LENGTH;

		/** @type {{ x: number; y: number; }[]} */
		const spaces = [];

		// Track the offset distance from the largest part of the hex (in primary), and which side we're on.
		// The initial side we use (sign) depends on the variant of ellipse we're building.
		let offsetDist = 0;
		let offsetSign = isVariant2 ? 1 : -1;

		for (let i = 0; i < secondaryAxisSize; i++) {
			const primaryAxisOffset = (offsetDist + 1) / 2;
			const secondaryPosition = (offsetDist * offsetSign * HEX_UNIT_SIDE_LENGTH * 1.5) + secondaryAxisOffset;

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

		const secondaryAxisOffset = isVariant2 ? HEX_UNIT_SIDE_LENGTH + ((secondaryAxisSize - 1) * HEX_UNIT_SIDE_LENGTH * 1.5) : HEX_UNIT_SIDE_LENGTH;

		/** @type {{ x: number; y: number; }[]} */
		const spaces = [];

		// Trazpezoids are simple. Start with a line in the primary direction that is the full primary size.
		// Then, for each cell in the secondary direction, reduce the primary by one.
		// If we are doing variant1 we offset in the secondary by one direction, for variant2 we go the other direction.
		for (let i = 0; i < secondaryAxisSize; i++) {
			const primaryAxisOffset = (i + 1) / 2;
			const secondaryPosition = (i * (isVariant2 ? -1 : 1) * HEX_UNIT_SIDE_LENGTH * 1.5) + secondaryAxisOffset;

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
		if (primaryAxisSize === 1 && secondaryAxisSize > 1) {
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
					(i * HEX_UNIT_SIDE_LENGTH * 1.5) + HEX_UNIT_SIDE_LENGTH
				));
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
			.map(p => ({ x: x + (p.x * gridSize), y: y + (p.y * gridSize) }));
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
				.map(p => ({ x: x + (p.x * gridSize), y: y + (p.y * gridSize) }));

		case CONST.TOKEN_HEXAGONAL_SHAPES.TRAPEZOID_1:
		case CONST.TOKEN_HEXAGONAL_SHAPES.TRAPEZOID_2:
			return getTrapezoidHexTokenSpaces(primaryAxisSize, secondaryAxisSize, isColumnar, isVariant2)
				.map(p => ({ x: x + (p.x * gridSize), y: y + (p.y * gridSize) }));

		case CONST.TOKEN_HEXAGONAL_SHAPES.RECTANGLE_1:
		case CONST.TOKEN_HEXAGONAL_SHAPES.RECTANGLE_2:
			return getRectangleHexTokenSpaces(primaryAxisSize, secondaryAxisSize, isColumnar, isVariant2)
				.map(p => ({ x: x + (p.x * gridSize), y: y + (p.y * gridSize) }));

		default:
			throw new Error("Unknown hex grid type.");
	}
}

/**
 * Given a list of cells and a grid, combines them together into as few polygons as possible.
 * @param {[number, number][]} cells An array of cells polygons to merge.
 * @param {BaseGrid} grid Grid to use to determine cell shape and dimensions.
 */
export function polygonsFromGridCells(cells, grid) {
	if ((cells.length ?? 0) === 0) return [];

	if (!grid || grid.type === CONST.GRID_TYPES.GRIDLESS) {
		// It's possible to end up here if changing scene properties when a migration is required. E.G. a user does
		// v2 data on a gridded scene, then changes the scene to gridless (which does not remove the data), then a 2->3
		// migration is done on that bad data.
		warn("Attempted to call `polygonsFromGridCells` on a gridless grid. This operation is not supported.");
		return [];
	}

	// For polygon calculation to work, we ensure the cells are sorted so that they process in clockwise order
	cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

	const polygons = cells.map(position => ({
		position,
		poly: new Polygon(getGridCellPolygon(...position)),
		cell: `${position[0]}|${position[1]}`
	}));

	// Generate a graph of all edges in all the polygons
	const allEdges = polygons.flatMap(({ poly, cell }) =>
		poly.edges.map(edge => ({ edge, cell })));

	// Maintain a record of which cells are adjacent (caused by pairs of edges destructing)
	/** @type {Map<string, Set<string>>} */
	const connectedCells = new Map();

	/** @type {(c1: string, c2: string) => void} */
	const connectCell = (c1, c2) => {
		const set = connectedCells.get(c1);
		if (set) set.add(c2);
		else connectedCells.set(c1, new Set([c2]));
	};

	// Remove any duplicate edges
	for (let i = 0; i < allEdges.length; i++) {
		for (let j = i + 1; j < allEdges.length; j++) {
			if (allEdges[i].edge.equals(allEdges[j].edge)) {
				connectCell(allEdges[j].cell, allEdges[i].cell);
				connectCell(allEdges[i].cell, allEdges[j].cell);
				allEdges.splice(j, 1);
				allEdges.splice(i, 1);
				i--;
				break;
			}
		}
	}

	// From some start edge, keep finding the next edge that joins it until we are back at the start.
	// If there are multiple edges starting at a edge's endpoint (e.g. two squares touch by a corner), then
	// use the one that most clockwise.
	/** @type {Polygon[]} */
	const combinedPolygons = [];
	while (allEdges.length) {
		// Find the next unvisited edge, and follow the edges until we join back up with the first
		const edges = allEdges.splice(0, 1);
		while (!edges[0].edge.p1.equals(edges[edges.length - 1].edge.p2)) {
			// To find the next edge, we find edges that start where the last edge ends.
			// For hex grids (where a max of 3 edges can meet), there will only ever be 1 other edge here (as if
			// there were 4 edges, 2 would've overlapped and been removed) so we can just use that edge.
			// But for square grids, there may be two edges that start here. In that case, we want to find the one
			// that is next when rotating counter-clockwise.
			const nextEdgeCandidates = allEdges
				.map(({ edge }, idx) => ({ edge, idx }))
				.filter(({ edge }) => edge.p1.equals(edges[edges.length - 1].edge.p2));

			if (nextEdgeCandidates.length === 0)
				throw new Error("Invalid graph detected. Missing edge.");

			const nextEdgeIndex = nextEdgeCandidates.length === 1
				? nextEdgeCandidates[0].idx
				: nextEdgeCandidates
					.map(({ edge, idx }) => ({ angle: edges[edges.length - 1].edge.angleBetween(edge), idx }))
					.sort((a, b) => a.angle - b.angle)[0].idx;

			const [nextEdge] = allEdges.splice(nextEdgeIndex, 1);
			edges.push(nextEdge);
		}

		// Work out which cells are part of this polygon
		// We initialise this set with the known cells - but these will only be cells that have at least one edge
		// that has not been destructed - e.g. in a hex with 2 polygons per side, the central hex would not be in
		// this list.
		// We then visit all the cells in this Set, and check to see if they are in the destruction map. If so, add
		// the cells from inner set to this set. Keep doing that until we've visited all cells (inc. newly added).
		const polygonCells = new OrderedSet(edges.map(({ cell }) => cell));
		for (const cell of polygonCells)
			polygonCells.addRange(connectedCells.get(cell));

		// Add completed polygon to the list
		combinedPolygons.push(new Polygon(edges.map(({ edge }) => edge.p1)));
	}

	// To determine if a polygon is a "hole" we need to check whether it is inside another polygon.
	// Since the polygon vertices are always the same direction, we can use to determine whether it is a hole: if
	// the points are going clockwise, then it IS NOT a hole, but if they are anti-clockwise then it IS a hole.
	// For each hole, we need to find which polygon it is a hole in, as the hole must be drawn immediately after.
	// To find the hole's parent, we search back up the sorted list of polygons in reverse for the first one that
	// contains it.
	/** @type {Map<boolean, typeof combinedPolygons>} */
	const polysAreHolesMap = groupBy(combinedPolygons, polygon => polygon.isHole);

	/** @type {{ polygon: Polygon; holes: Polygon[]; }[]} */
	const solidPolygons = (polysAreHolesMap.get(false) ?? []).map(polygon => ({ polygon, holes: [] }));

	const holePolygons = polysAreHolesMap.get(true) ?? [];

	// For each hole, we need to check which non-hole poly it is inside. We gather a list of non-hole polygons that
	// contains it. If there is only one, we have found which poly it is a hole of. If there are more, we imagine a
	// horizontal line drawn from the topmost point of the inner polygon (with a little Y offset added so that we
	// don't have to worry about vertex collisions) to the left and find the first polygon that it intersects.
	for (const holePolygon of holePolygons) {
		const containingPolygons = solidPolygons.filter(({ polygon }) => polygon.containsPolygon(holePolygon));

		if (containingPolygons.length === 0) {
			error("Something went wrong calculating which polygon this hole belonged to: No containing polygons found.", { holePolygon, solidPolygons });
			throw new Error("Could not find a parent polygon for this hole.");

		} else if (containingPolygons.length === 1) {
			containingPolygons[0].holes.push(holePolygon);

		} else {
			const testPoint = holePolygon.vertices
				.find(p => p.y === holePolygon.boundingBox.y1)
				.offset({ y: canvas.grid.sizeY * 0.05 });

			const intersectsWithEdges = containingPolygons.flatMap(({ polygon }) => polygon.edges
				.map(edge => ({
					intersectsAt: edge.intersectsYAt(testPoint.y),
					shape
				}))
				.filter(x => x.intersectsAt && x.intersectsAt < testPoint.x));

			if (intersectsWithEdges.length === 0) {
				error("Something went wrong calculating which polygon this hole belonged to: No edges intersected horizontal ray.", { holePolygon, solidPolygons });
				throw new Error("Could not find a parent polygon for this hole.");
			}

			intersectsWithEdges.sort((a, b) => b.intersectsAt - a.intersectsAt);
			intersectsWithEdges[0].shape.holes.push(holePolygon);
		}
	}

	return solidPolygons;
}
