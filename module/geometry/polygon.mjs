import { Edge } from "./edge.mjs";
import { Vertex } from "./vertex.mjs";

export class Polygon {

	/**
	 * @param {Vertex[]} [points]
	 */
	constructor(points = undefined) {
		/** @type {Vertex[]} */
		this.points = points ?? [];
	}

	get edges() {
		return this.points.map((point, idx) => new Edge(point, this.points[(idx + 1) % this.points.length]));
	}

	/** @param {Vertex} point */
	get boundingBox() {
		const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
		for (const point of this.points) {
			if (point.x < box.x1) box.x1 = point.x;
			if (point.y < box.y1) box.y1 = point.y;
			if (point.x > box.x2) box.x2 = point.x;
			if (point.y > box.y2) box.y2 = point.y;
		}
		return box;
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

		canvas.terrainHeightLayer._debugDrawRect(thisBb.x1, thisBb.y1, thisBb.x2, thisBb.y2);
		canvas.terrainHeightLayer._debugDrawRect(otherBb.x1, otherBb.y1, otherBb.x2, otherBb.y2, 0xFF0000);

		if (thisBb.x1 > otherBb.x1 || thisBb.y1 > otherBb.y1 || thisBb.x2 < otherBb.x2 || thisBb.y2 < otherBb.y2)
			return false;

		// If the bounding box test passes, then we can check that a random point from the other polygon is within this
		// polygon. This relies on the assumption that the polygons will never intersect one another.
		// We do this by taking a the top-most vertex and adding a small Y offset (so we don't have to deal with vertex
		// intersections), and count how many edges a ray from this point to the edge of the canvas crosses. If it's an
		// odd number, then this is within the polygon. We don't need to woyry about the offset causing the point to no
		// longer be within the polygon as all the grid shapes are convex.
		const testPoint = other.points.find(p => p.y === otherBb.y1).clone();
		testPoint.y += canvas.grid.h * 0.05;

		const intersections = this.edges
			.map(e => e.intersectsYAt(testPoint.y))
			.filter(x => !!x && x < testPoint.x);

		canvas.terrainHeightLayer._debugDrawLine(0, testPoint.y, testPoint.x, testPoint.y);
		intersections.forEach(x => canvas.terrainHeightLayer._debugDrawVertex({ x, y: testPoint.y }));

		return intersections.length % 2 === 1;
	}
}
