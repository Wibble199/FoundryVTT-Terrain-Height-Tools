/**
 * X and Y coordinates representing a position.
 */
export class Vertex {
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

	clone() {
		return new Vertex(this.x, this.y);
	}
}
