import { Edge } from "./edge.mjs";
import { Vertex } from "./vertex.mjs";

export class Polygon {

	/** @type {Vertex[]} */
	#vertices;

	/** @type {Edge[]} */
	#edges;

	/**
	 * @param {Vertex[]} [vertices]
	 */
	constructor(vertices = undefined) {
		this.#vertices = vertices ?? [];
		this.#edges = this.#vertices.map((v, idx) => new Edge(v, this.#vertices[(idx + 1) % this.#vertices.length]));

		// Calculate initial bounding box
		this.boundingBox = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
		for (const vertex of this.#vertices) this.#addToBoundingBox(vertex);
	}

	/** @type {readonly Vertex[]} */
	get vertices() {
		return [...this.#vertices];
	}

	/** @type {readonly Egde[]} */
	get edges() {
		return [...this.#edges];
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

		// Update bounding box if this point falls outside of it
		this.#addToBoundingBox(vertex);
	}

	/**
	 * Determines whether this polygon contains another polygon.
	 * @param {Polygon} other
	 */
	contains(other) {
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

		const intersections = this.edges
			.map(e => e.intersectsYAt(testPoint.y))
			.filter(x => !!x && x < testPoint.x);

		return intersections.length % 2 === 1;
	}

	/**
	 * If the given Vertex lies outside the bounding box, updates the box to contain it.
	 * @param {Vertex} vertex
	 */
	#addToBoundingBox(vertex) {
		if (vertex.x < this.boundingBox.x1) this.boundingBox.x1 = vertex.x;
		if (vertex.y < this.boundingBox.y1) this.boundingBox.y1 = vertex.y;
		if (vertex.x > this.boundingBox.x2) this.boundingBox.x2 = vertex.x;
		if (vertex.y > this.boundingBox.y2) this.boundingBox.y2 = vertex.y;
	}
}
