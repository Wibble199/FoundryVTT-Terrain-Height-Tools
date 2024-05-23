import { Point } from "./point.mjs";

/**
 * Represents a line segment, from `p1` to `p2`.
 * LineSegments are considered equal regardless of 'direction'. I.E. p1 vs p2 order does not matter.
 */
export class LineSegment {
	/**
	 * @param {Point} p1
	 * @param {Point} p2
	 */
	constructor(p1, p2) {
		this.p1 = p1;
		this.p2 = p2;
	}

	/**
	 * Creates a LineSegment from a pair of x,y coordinates.
	 * @param {number} x1
	 * @param {number} y1
	 * @param {number} x2
	 * @param {number} y2
	 */
	static fromCoords(x1, y1, x2, y2) {
		return new LineSegment(new Point(x1, y1), new Point(x2, y2));
	}

	/** Determines if this line segment is pointing in a clockwise direction. */
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

	get angle() {
		const dx = this.p2.x - this.p1.x;
		const dy = this.p2.y - this.p1.y;
		return Math.atan2(dy, dx);
	}

	get lengthSquared() {
		return Math.pow(this.p2.x - this.p1.x, 2) + Math.pow(this.p2.y - this.p1.y, 2);
	}

	/** @param {LineSegment} other */
	equals(other) {
		return (this.p1.equals(other.p1) && this.p2.equals(other.p2))
			|| (this.p1.equals(other.p2) && this.p2.equals(other.p1));
	}

	/**
	 * Gets the Y position that this line segment intersects a vertical line at `x`. Returns undefined if this line is
	 * vertical or does not pass the given `x` position.
	 * @param {number} x
	 * @returns {number | undefined}
	 */
	intersectsXAt(x) {
		// If the given `x` is not between p1.x and p2.x, return undefined
		if (x >= Math.max(this.p1.x, this.p2.x) || x <= Math.min(this.p1.x, this.p2.x))
			return undefined;

		const slope = this.slope;

		// If slope is infinity, line is vertical, so does not intersect X
		if (slope === Infinity)
			return undefined;

		// If slope is 0, line is horizontal, so it's p1.y and p2.y are the same, and it intersects there
		if (slope === 0)
			return this.p1.y;

		// For other values, line is diagonal, so work out where it would meet the X
		return this.p1.y + (x - this.p1.x) * slope;
	}


	/**
	 * Gets the X poisition that this line segmnet intersects a horizontal line at `y`. Returns undefined if this line
	 * is horizontal or does not pass the given `y` position.
	 * @param {number} y
	 * @returns {number | undefined}
	 */
	intersectsYAt(y) {
		// If the given `y` is not between p1.y and p2.y, return undefined
		if (y > Math.max(this.p1.y, this.p2.y) || y < Math.min(this.p1.y, this.p2.y))
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
	 * Gets the X and Y position that this line segment intersects another line segment, as well as the relative
	 * distance along each line segmnet that the intersection occured.
	 *
	 * The returned `t` value is how far along 'this' line segment the intersection point is at:
	 * - 0 means that the intersection is at this.p1.
	 * - 1 means that the intersection is at this.p2.
	 * - Another value (which will be between 0-1) means it proportionally lies along the line segment.
	 *
	 * The returned `u` value is the equivalent of `t` but for the 'other' line segment.
	 *
	 * Returns undefined if the line segments do not intersect.
	 * Parallel lines are never considered to intersect.
	 * @param {LineSegment} other
	 * @returns {{ x: number; y: number; t: number; u: number } | undefined}
	 */
	intersectsAt(other) {
		if (this.lengthSquared <= 0 || other.lengthSquared <= 0) return undefined;

		const { x: x1, y: y1 } = this.p1;
		const { x: x2, y: y2 } = this.p2;
		const { x: x3, y: y3 } = other.p1;
		const { x: x4, y: y4 } = other.p2;

		// If slopes are equal (or very close) then the lines are parallel, so we treat as no intersection
		const slope1 = (y2 - y1) / (x2 - x1);
		const slope2 = (y4 - y3) / (x4 - x3);
		if (Math.abs(slope1 - slope2) < 0.005 || // 0.005 = 1px variance in y axis per 200px in x axis.
			([Infinity, -Infinity].includes(slope1) && [Infinity, -Infinity].includes(slope2)))
			return undefined;


		// `t` is how far along `this` line the intersection point is at: 0 means that the intersection is at p1, 1 means
		// that the intersection is at p2, a value between 0-1 means it lies on the line, <0 or >1 means it lies out of the
		// line. `u` is the same, but for the `other` line.
		const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
		const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
		const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

		// If the intersection point lies outside of either line, then there is no intersection
		if (t < 0 || t > 1 || u < 0 || u > 1) return undefined;

		return {
			x: x1 + t * (x2 - x1),
			y: y1 + t * (y2 - y1),
			t, u
		};
	}

	/**
	 * Linearly interpolates the X,Y position of a point that is at `t` along the line.
	 * @param {number} t
	 * @returns {[number, number]}
	 */
	lerp(t) {
		return [
			(this.p2.x - this.p1.x) * t + this.p1.x,
			(this.p2.y - this.p1.y) * t + this.p1.y
		];
	}

	/**
	 * Works out the interior angle between this line segment and another line segment.
	 * This makes the assumption `other` starts where `this` ends and the polygon is defined clockwise.
	 * @param {LineSegment} other
	 */
	angleBetween(other) {
		const angle = this.angle;
		const angleOther = other.angle;

		let diff = angleOther - angle;
		if (diff < 0) diff += 2 * Math.PI;
		return Math.PI - diff;
	}

	/**
	 * Creates the LineSegment that represents this inverse of this LineSegment.
	 */
	inverse() {
		return new LineSegment(this.p2, this.p1);
	}

	toString() {
		return `LineSegment { (${this.p1.x}, ${this.p1.y}) -> (${this.p2.x}, ${this.p2.y}) }`;
	}
}
