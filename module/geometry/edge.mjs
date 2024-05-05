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
	 * Checks whether or not this edge intersects another.
	 * @param {Edge} other
	 */
	intersects(other) {
		// Adapted from: https://stackoverflow.com/a/16725715
		// I do not understand at all :)
		return turn(this.p1, other.p1, other.p2) !== turn(this.p2, other.p1, other.p2)
			&& turn(this.p1, this.p2, other.p1) !== turn(this.p1, this.p2, other.p2);

		/**
		 * @param {Vertex} p1
		 * @param {Vertex} p2
		 * @param {Vertex} p3
		 */
		function turn(p1, p2, p3) {
			const a = (p3.y - p1.y) * (p2.x - p1.x);
			const b = (p2.y - p1.y) * (p3.x - p1.x);
			return (a > b + Number.EPSILON) ? 1 : (a + Number.EPSILON < b) ? -1 : 0;
		}
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
}
