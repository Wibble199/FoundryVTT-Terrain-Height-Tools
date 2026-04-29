import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Polygon } from "../../src/geometry/polygon.mjs";

describe("Polygon", () => {
	describe("constructor", () => {
		it("should throw an error if given vertices result in a self-intersecting polygon", () => {
			assert.throws(() => {
				new Polygon([
					{ x: 0, y: 0 },
					{ x: 0, y: 100 },
					{ x: 100, y: 0 },
					{ x: 100, y: 100 }
				]);
			});
		});
	});

	describe("isClockwise", () => {
		it("should be true for clockwise polygons", () => {
			const isClockwise = Polygon.isClockwise([
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				{ x: 100, y: 100 },
				{ x: 0, y: 100 }
			]);

			assert.equal(isClockwise, true);
		});

		it("should be false for counter-clockwise polygons", () => {
			const isClockwise = Polygon.isClockwise([
				{ x: 0, y: 0 },
				{ x: 0, y: 100 },
				{ x: 100, y: 100 },
				{ x: 100, y: 0 }
			]);

			assert.equal(isClockwise, false);
		});
	});
});
