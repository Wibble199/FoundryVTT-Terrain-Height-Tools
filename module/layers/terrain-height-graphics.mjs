/**
 * X and Y coordinates representing a position.
 */
class Vertex {
	/**
	 * @param {number} x
	 * @param {number} y
	 */
	constructor(x, y) {
		/** @type {number} */
		this.x = x;
		/** @type {number} */
		this.y = y;
	}

	/** @param {Vertex} other */
	equals(other) {
		// Hex grids can can get a little weird about rounding, so to make it easier we assume points are equal if there
		// is less than 1 pixel between them.
		return Math.abs(this.x - other.x) < 1 && Math.abs(this.y - other.y) < 1;
	}
}

/**
 * Represents an edge on a polygon, from `p1` to `p2`.
 * Edges are considered equal regardless of 'direction'. I.E. p1 vs p2 order does not matter.
 */
class Edge {
	/**
	 * @param {Vertex} p1
	 * @param {Vertex} p2
	 */
	constructor(p1, p2) {
		/** @type {Vertex} */
		this.p1 = p1;
		/** @type {Vertex} */
		this.p2 = p2;
	}

	/** Determines if this edge is pointing in a clockwise direction. */
	get clockwise() {
		// If the p1.x < p2.x, then clockwise
		// If p1.x ~= p2.x, check if p1.y > p2.y, then clockwise
		if (Math.abs(this.p1.x - this.p2.x) < 1)
			return this.p1.y > this.p2.y;
		return this.p1.x < this.p2.x;
	}

	/** @param {Edge} other */
	equals(other) {
		return (this.p1.equals(other.p1) && this.p2.equals(other.p2))
			|| (this.p1.equals(other.p2) && this.p2.equals(other.p1));
	}
}


/**
 * @typedef {Vertex[]} Polygon
 * A set of points that make up a polygon.
 */

/**
 * Specialised PIXI.Graphics instance for rendering a scene's terrain height data to the canvas.
 */
export default class TerrainHeightGraphics extends PIXI.Graphics {

	constructor() {
		super();
	}

	// Sorting within the PrimaryCanvasGroup works by the `elevation`, then by whether it is a token, then by whether it
	// is a Drawing, then finally by the `sort`.
	// Using an elevation of 0 puts it at the same level as tokens, tiles (except overhead tiles, which are 4), drawings
	// etc. Using Infinity sort places it above the tiles, however because the PCG explicitly checks for DrawingShape
	// and TokenMesh, changing the sort won't make it appear over those.
	// End result should be below drawings, tokens, overhead tiles, but above ground-level tiles.
	get elevation() { return 0; }
	get sort() { return Infinity; }

	/**
	 * Redraws the graphics layer using the supplied data.
	 * @param {*} data // TODO: use a proper typedef
	 */
	update(data) {
		this.clear();

		const polys = data.gridCoordinates.map(([x, y]) => this.#getPolyPoints(x, y));
		const mergedPolys = TerrainHeightGraphics.#combinePolygons(polys);
		mergedPolys.forEach(({ poly, isHole }) => {
			if (isHole) this.beginHole();
			this.drawPolygon2(poly);
			if (isHole) this.endHole();
		});
	}

	/**
	 * @param {Polygon} polygon
	 */
	drawPolygon2(polygon) {
		this.beginFill(0xFF0000, 0.4);
		this.lineStyle({ width: 8, color: 0xFF0000, alpha: 0.8, alignment: 0 });

		this.moveTo(polygon[0]);
		for (let i = 1; i < polygon.length; i++) {
			this.lineTo(polygon[i]);
		}
		this.lineTo(polygon[0]);
		this.closePath();

		this.endFill();
	}

	/**
	 * Extends the existing moveTo method to allow also taking an object with an x and y.
	 * @param {number | { x: number; y: number }} x Either the X position, or an object with an X and Y component.
	 * @param {number | undefined} y If X was a number, the Y position; otherwise undefined.
	 * @override
	 */
	moveTo(x, y = undefined) {
		if (typeof x === "number")
			return super.moveTo(x, y);
		return super.moveTo(x.x, x.y);
	}

	/**
	 * Extends the existing lineTo method to allow also taking an object with an x and y.
	 * @param {number | { x: number; y: number }} x Either the X position, or an object with an X and Y component.
	 * @param {number | undefined} y If X was a number, the Y position; otherwise undefined.
	 * @override
	 */
	lineTo(x, y = undefined) {
		if (typeof x === "number")
			return super.lineTo(x, y);
		return super.lineTo(x.x, x.y);
	}

	/**
	 * For the cell at the given x and y grid coordinates, returns the points to draw a poly at that location.
	 * The points are returned in a clockwise direction.
	 * @param {number} cx X cordinates of the space to get points for.
	 * @param {number} cy Y cordinates of the space to get points for.
	 * @returns {Polygon}
	 */
	#getPolyPoints(cx, cy) {
		// Gridless is not supported
		if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

		const [x, y] = canvas.grid.grid.getPixelsFromGridPosition(cx, cy);

		// Can get the points for a square grid easily
		if (canvas.grid.type === CONST.GRID_TYPES.SQUARE) {
			const { w, h } = canvas.grid;
			return [
				new Vertex(x, y),
				new Vertex(x + w, y),
				new Vertex(x + w, y + h),
				new Vertex(x, y + h)
			];
		}

		// For hex grids, can use the getPolygon function to generate them for us
		const pointsFlat = canvas.grid.grid.getPolygon(x, y)
		const points = [];
		for (let i = 0; i < pointsFlat.length; i += 2) {
			points.push(new Vertex(pointsFlat[i], pointsFlat[i + 1]));
		}
		return points;
	}

	/**
	 * Given a list of polygons, combines them together into as few polygons as possible.
	 * @param {Polygon[]} polygons An array of polygons to
	 * @returns {{ poly: Polygon; isHole: boolean }[]}
	 */
	static #combinePolygons(polygons) {

		// Generate a graph of all vertices in all the polygons
		const vertices = polygons.flatMap(this.#getVertices);

		// Remove any duplicate verticies
		for (let i = 0; i < vertices.length; i++) {
			for (let j = i + 1; j < vertices.length; j++) {
				if (vertices[i].equals(vertices[j])) {
					vertices.splice(j, 1);
					vertices.splice(i, 1);
					i--;
					break;
				}
			}
		}

		// From some start vertex, keep finding the next vertex that joins it until we are back at the start.
		// If there are multiple vertices starting at a vertex's endpoint (e.g. two squares touch by a corner), then
		// use the one that most clockwise.
		const mergedPolygons = [];
		while (vertices.length) {
			const polygon = [vertices[0]];
			vertices.splice(0, 1);
			while (!polygon[0].p1.equals(polygon[polygon.length - 1].p2)) {
				// TODO: handle corner joins
				// TODO: in square grids, we can optimise edges by joining those that are adjacent and parallel.
				const nextVertexIndex = vertices.findIndex(v => v.p1.equals(polygon[polygon.length - 1].p2));
				if (nextVertexIndex === -1) throw new Error("Invalid graph detected. Missing vertex.");
				const [nextVertex] = vertices.splice(nextVertexIndex, 1);
				polygon.push(nextVertex);
			}
			mergedPolygons.push(polygon.map(v => v.p1));
		}

		// To determine if a polygon is a "hole" we need to check whether it is inside another polygon.
		// Since the polygon vertices are always the same direction, we can use to determine whether it is a hole: if
		// the points are going clockwise, then it IS NOT a hole, but if they are anti-clockwise then it IS a hole.
		return mergedPolygons.map(polygon => ({
			poly: polygon,
			isHole: !new Edge(polygon[0], polygon[1]).clockwise
		}));
	}

	/**
	 * Constructs the vertices of the given polygon.
	 * @param {Polygon} polygon
	 * @returns {Edge[]}
	 */
	static #getVertices(polygon) {
		return polygon.map((point, idx) => new Edge(point, polygon[(idx + 1) % polygon.length]));
	}

	/**
	 * Monkey-patches the `PrimaryCanvasGroup` to initialise and tearDown a TerrainHeightGraphics instances.
	 */
	static patchPrimaryCanvasGroup() {
		// When the primary group is drawn, also create a TerrainHeightGraphics instance
		const superDraw = PrimaryCanvasGroup.prototype.draw;
		PrimaryCanvasGroup.prototype.draw = function() {
			superDraw.call(this);
			this.terrainHeightGraphics = new TerrainHeightGraphics();
			this.addChild(this.terrainHeightGraphics);
		};

		// When the primary group is torn down, remove the TerrainHeightGraphics instance
		const superTearDown = PrimaryCanvasGroup.prototype.tearDown;
		PrimaryCanvasGroup.prototype.tearDown = function() {
			superTearDown.call(this);
			this.removeChild(this.terrainHeightGraphics);
			this.terrainHeightGraphics = null;
		};
	}
}
