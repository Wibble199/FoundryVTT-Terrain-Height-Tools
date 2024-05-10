import { Edge } from "./edge.mjs";
import { Vertex } from "./vertex.mjs";

export class Polygon {

	/** @type {Vertex[]} */
	#vertices = [];

	/** @type {Edge[]} */
	#edges = [];

	/** @type {[number, number]} */
	#centroid = [0, 0];

	/**
	 * @param {Vertex[]} [vertices]
	 */
	constructor(vertices = undefined) {
		this.boundingBox = {
			x1: Infinity, y1: Infinity,
			x2: -Infinity, y2: -Infinity,
			get w() { return this.x2 - this.x1; },
			get h() { return this.y2 - this.y1; },
			get xMid() { return (this.x1 + this.x2) / 2 },
			get yMid() { return (this.x1 + this.x2) / 2 }
		};

		for (const vertex of vertices ?? []) {
			this.pushPoint(vertex);
		}
	}

	/** @type {readonly Vertex[]} */
	get vertices() {
		return [...this.#vertices];
	}

	/** @type {readonly Edge[]} */
	get edges() {
		return [...this.#edges];
	}

	/** @type {readonly [number, number]} */
	get centroid() {
		return [...this.#centroid];
	}

	/**
	 * Pushes a vertex to the end of the polygon.
	 * @param {number | Vertex} x The X coordinate of the point or a Vertex object to add.
	 * @param {number | undefined} y The Y coordinate of the point or undefined.
	 */
	pushPoint(x, y = undefined) {
		const vertex = x instanceof Vertex ? x : new Vertex(x, y);

		this.#vertices.push(vertex);

		// If there is atleast one existing edge, update the last edge so that it instead ends at the new point
		if (this.#edges.length >= 1)
			this.#edges[this.#edges.length - 1].p2 = vertex;

		// Add a new edge from this new vertex to the first vertex (when there were no vertices in this polygon before, this
		// would make an edge from this new vertex to iself, but when more vertices are added this works fine).
		this.#edges.push(new Edge(vertex, this.#vertices[0]));

		// Update bounding box and centroid
		this.#updateCalculatedValues(vertex);
	}

	/**
	 * Determines whether this polygon contains another polygon.
	 * @param {Polygon} other
	 */
	containsPolygon(other) {
		// First we can quickly check if the bounding box of `other` entirely fits within this bounding box.
		// If it does not, we can skip the more complex edge intersection tests as there is no way this contains other.
		const thisBb = this.boundingBox;
		const otherBb = other.boundingBox;

		if (thisBb.x1 > otherBb.x1 || thisBb.y1 > otherBb.y1 || thisBb.x2 < otherBb.x2 || thisBb.y2 < otherBb.y2)
			return false;

		// If the bounding box test passes, then we can check that a random point from the other polygon is within this
		// polygon. This relies on the assumption that the polygons will never intersect one another.
		// We do this by taking a the top-most vertex and adding a small Y offset (so we don't have to deal with vertex
		// intersections), and count how many edges a ray from this point to the edge of the canvas crosses. If it's an
		// odd number, then this is within the polygon. We don't need to woyry about the offset causing the point to no
		// longer be within the polygon as all the grid shapes are convex.
		const testPoint = other.vertices.find(p => p.y === otherBb.y1).offset({ y: game.canvas.grid.h * 0.05 });

		const numberOfIntersections = this.edges
			.map(e => e.intersectsYAt(testPoint.y))
			.filter(x => !!x && x < testPoint.x)
			.length;

		return numberOfIntersections % 2 === 1;
	}

	/**
	 * Determines if this point is within the bounds of this polygon.
	 * @param {number} x
	 * @param {number} y
	 */
	containsPoint(x, y) {
		const { boundingBox } = this;

		// If the point is not even in the bounding box, don't need to check the vertices
		if (x < boundingBox.x1 || x > boundingBox.x2 || y < boundingBox.y1 || y > boundingBox.y2)
			return false;

		// From the point, count how many edges it intersects when a line is drawn from this point to the left edge
		// of the canvas. If there's an odd number of intersections, it must be inside the polygon.
		const numberOfIntersections = this.#edges
			.map(e => e.intersectsYAt(y))
			.filter(intersectX => !!intersectX && intersectX < x)
			.length;

		return numberOfIntersections % 2 == 1;
	}

	/**
	 * Updates any of the calculated values for the newly added vertex.
	 * Should be called _after_ adding the vertex to the array.
	 * @param {Vertex} vertex
	 */
	#updateCalculatedValues(vertex) {
		// Update the centroid (the average of all vertices)
		this.#centroid[0] += (vertex.x - this.#centroid[0]) / this.#vertices.length;
		this.#centroid[1] += (vertex.y - this.#centroid[1]) / this.#vertices.length;

		// If the given Vertex lies outside the bounding box, updates the box to contain it.
		if (vertex.x < this.boundingBox.x1) this.boundingBox.x1 = vertex.x;
		if (vertex.y < this.boundingBox.y1) this.boundingBox.y1 = vertex.y;
		if (vertex.x > this.boundingBox.x2) this.boundingBox.x2 = vertex.x;
		if (vertex.y > this.boundingBox.y2) this.boundingBox.y2 = vertex.y;
	}
}
