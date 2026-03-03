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
