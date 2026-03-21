/** @typedef {Point | { x: number; y: number } | { X: number; Y: number } | [number, number]} PointLike */

/**
 * X and Y coordinates representing a position.
 */
export class Point {

	// Hide X & Y and expose them as get properties so the Vertex is immutable
	#x;

	#y;

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	constructor(x, y) {
		this.#x = x;
		this.#y = y;
	}

	get x() {
		return this.#x;
	}

	get y() {
		return this.#y;
	}

	/**
	 * Constructs a Point from another point, an object with x and y properties, or a pair of numbers.
	 * @param {PointLike} xy
	 */
	static from(xy) {
		switch (true) {
			case xy instanceof Point:
				return new Point(xy.#x, xy.#y);
			case Array.isArray(xy) && typeof xy[0] === "number" && typeof xy[1] === "number":
				return new Point(xy[0], xy[1]);
			case typeof xy === "object" && typeof xy.x === "number" && typeof xy.y === "number":
				return new Point(xy.x, xy.y);
			case typeof xy === "object" && typeof xy.X === "number" && typeof xy.Y === "number":
				return new Point(xy.X, xy.Y);
			default:
				throw new Error(`Invalid point. Expected a Point instance, a pair of numbers, or an object with 'x' and 'y' number properties. Got: ${xy}`);
		}
	}

	/**
	 * @param {Point} other
	 * @param {Object} [options={}]
	 * @param {number} [options.precision=1] The amount of variance allowed between points in BOTH the X and Y coordinates
	 * for them to be considered equal. */
	equals(other, { precision = 1 } = {}) {
		// Hex grids can can get a little weird about rounding, so to make it easier we assume points are equal if there
		// is less than 1 pixel between them.
		return Math.abs(this.x - other.x) <= precision && Math.abs(this.y - other.y) <= precision;
	}

	/** Creates a clone of this point with the given X/Y offset. */
	offset({ x = 0, y = 0 }) {
		return new Point(this.#x + x, this.#y + y);
	}
}
