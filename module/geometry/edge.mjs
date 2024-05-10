import { Vertex } from "./vertex.mjs";

/**
 * Represents an edge on a polygon, from `p1` to `p2`.
 * Edges are considered equal regardless of 'direction'. I.E. p1 vs p2 order does not matter.
 */
export class Edge {
	/**
	 * @param {Vertex} p1
	 * @param {Vertex} p2
	 */
	constructor(p1, p2) {
		this.p1 = p1;
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

	get slope() {
		return this.p1.x !== this.p2.x
			? (this.p2.y - this.p1.y) / (this.p2.x - this.p1.x)
			: Infinity;
	}

	/** @param {Edge} other */
	equals(other) {
		return (this.p1.equals(other.p1) && this.p2.equals(other.p2))
			|| (this.p1.equals(other.p2) && this.p2.equals(other.p1));
	}

	/**
	 * Gets the X poisition that this edge intersects a horizontal line at `y`. Returns undefined if this line is
	 * horizontal or does not pass the given `y` position.
	 * @param {number} y
	 * @returns {number | undefined}
	 */
	intersectsYAt(y) {
		// If the given `y` is not between p1.y and p2.y, return undefined
		if (y >= Math.max(this.p1.y, this.p2.y) || y <= Math.min(this.p1.y, this.p2.y))
			return undefined;

		const slope = this.slope;

		// If slope is 0, line is horizontal, so does not intersect Y
		if (slope === 0)
			return undefined;

		// If slope is infinity, line is vertical, so it's p1.x and p2.x are the same, and it intersects there
		if (slope === Infinity)
			return this.p1.x;

		// For other values, line is diagonal, so work out where it would meet the Y
		return this.p1.x + (y - this.p1.y) / slope;
	}

	/**
	 * Gets the X and Y position that this edge intersects another edge, as well as the relative distance along the edge
	 * that the intersection occured.
	 *
	 * The returned `t` value is how far along 'this' edge the intersection point is at:
	 * - 0 means that the intersection is at this.p1.
	 * - 1 means that the intersection is at this.p2.
	 * - Another value (which will be between 0-1) means it proportionally lies along the edge.
	 *
	 * The returned `u` value is the equivalent of `t` but for the 'other' edge.
	 *
	 * Returns undefined if the edges do not intersect.
	 * Parallel lines are never considered to intersect.
	 * @param {Edge} other
	 * @returns {{ x: number; y: number; t: number; u: number } | undefined}
	 */
	intersectsAt(other) {
		const { x: x1, y: y1 } = this.p1;
		const { x: x2, y: y2 } = this.p2;
		const { x: x3, y: y3 } = other.p1;
		const { x: x4, y: y4 } = other.p2;

		// If denom is 0, lines are parallel and do not intersect.
		const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
		if (denom === 0) return undefined;

		// `t` is how far along `this` edge the intersection point is at: 0 means that the intersection is at p1, 1 means
		// that the intersection is at p2, a value between 0-1 means it lies on the edge, <0 or >1 means it lies out of the
		// edge. `u` is the same, but for the `other` edge.
		const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
		const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

		// If the intersection point lies outside of either edge, then there is no intersection
		if (t < 0 || t > 1 || u < 0 || u > 1) return undefined;

		return {
			x: x1 + t * (x2 - x1),
			y: y1 + t * (y2 - y1),
			t, u
		};
	}

	/**
	 * Works out the interior angle between this edge and another edge
	 * This makes the assumption `other` starts where `this` ends and the polygon is defined clockwise.
	 * @param {Edge} other
	 */
	angleBetween(other) {
		const dx = this.p2.x - this.p1.x;
		const dy = this.p2.y - this.p1.y;
		const angle = Math.atan2(dy, dx);

		const dxOther = other.p2.x - other.p1.x;
		const dyOther = other.p2.y - other.p1.y;
		const angleOther = Math.atan2(dyOther, dxOther);

		let diff = angleOther - angle;
		if (diff < 0) diff += 2 * Math.PI;
		return Math.PI - diff;
	}

	toString() {
		return `Edge { (${this.p1.x}, ${this.p1.y}) -> (${this.p2.x}, ${this.p2.y}) }`;
	}
}
