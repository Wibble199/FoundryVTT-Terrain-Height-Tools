import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HeightMapShape } from "../../module/geometry/height-map-shape.mjs";

describe("HeightMapShape::calculateLineOfSight()", () => {

	const rectangle = new HeightMapShape({
		terrainTypeId: "a",
		polygon: [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 50 },
			{ x: 0, y: 50 }
		],
		holes: [],
		elevation: 2,
		height: 2,
		cells: []
	});

	const doughnut = new HeightMapShape({
		terrainTypeId: "a",
		polygon: [
			{ x: 0, y: 0 },
			{ x: 30, y: 0 },
			{ x: 30, y: 30 },
			{ x: 0, y: 30 }
		],
		holes: [
			[
				{ x: 10, y: 10 },
				{ x: 10, y: 20 },
				{ x: 20, y: 20 },
				{ x: 20, y: 10 }
			]
		],
		elevation: 5,
		height: 1,
		cells: []
	})

	it("should produce no intersection when the ray does not pass through the shape in the XY plane", () => {
		const intersections = rectangle.getIntersections({ x: 20, y: 51, h: 3 }, { x: 100, y: 80, h: 3 }, true);

		assert.deepEqual(intersections, []);
	});

	it("should produce no intersection when the ray passes over the shape", () => {
		const intersections = rectangle.getIntersections({ x: 50, y: -10, h: 5 }, { x: 50, y: 60, h: 5 }, true);

		assert.deepEqual(intersections, []);
	});

	it("should produce expected intersection when the ray passes through two sides of the shape", () => {
		const intersections = rectangle.getIntersections({ x: -50, y: 25, h: 2 }, { x: 150, y: 25, h: 4 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 0, y: 25, h: 2.5, t: 0.25 },
			end: { x: 100, y: 25, h: 3.5, t: 0.75 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray passes through two sides of the shape and a hole", () => {
		const intersections = doughnut.getIntersections({ x: 15, y: -5, h: 5 }, { x: 15, y: 35, h: 6 }, true);

		assert.deepEqual(intersections, [
			{
				start: { x: 15, y: 0, h: 5.125, t: 0.125 },
				end: { x: 15, y: 10, h: 5.375, t: 0.375 },
				skimmed: false
			},
			{
				start: { x: 15, y: 20, h: 5.625, t: 0.625 },
				end: { x: 15, y: 30, h: 5.875, t: 0.875 },
				skimmed: false
			}
		]);
	});

	it("should produce expected intersection when the ray starts inside the shape, then exits a side", () => {
		const intersections = rectangle.getIntersections({ x: 50, y: 25, h: 3 }, { x: 30, y: -25, h: 3 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 50, y: 25, h: 3, t: 0 },
			end: { x: 40, y: 0, h: 3, t: 0.5 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray starts outside the shape, then enters a side", () => {
		const intersections = rectangle.getIntersections({ x: 30, y: 75, h: 3 }, { x: 50, y: 25, h: 3 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 40, y: 50, h: 3, t: 0.5 },
			end: { x: 50, y: 25, h: 3, t: 1 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray starts inside a hole, and enters the shape", () => {
		const intersections = doughnut.getIntersections({ x: 15, y: 15, h: 5.4 }, { x: 5, y: 5, h: 5.8 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 10, y: 10, h: 5.6, t: 0.5 },
			end: { x: 5, y: 5, h: 5.8, t: 1 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray starts in the shape, and stops in a hole", () => {
		const intersections = doughnut.getIntersections({ x: 25, y: 5, h: 5.2 }, { x: 15, y: 15, h: 5.2 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 25, y: 5, h: 5.2, t: 0 },
			end: { x: 20, y: 10, h: 5.2, t: 0.5 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray extends past the bottom and top of the shape", () => {
		const intersections = rectangle.getIntersections({ x: 10, y: 25, h: 0 }, { x: 90, y: 25, h: 8 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 30, y: 25, h: 2, t: 0.25 },
			end: { x: 50, y: 25, h: 4, t: 0.5 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray starts inside the shape, then exits the top plane", () => {
		const intersections = rectangle.getIntersections({ x: 10, y: 30, h: 3 }, { x: 30, y: 40, h: 5 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 10, y: 30, h: 3, t: 0 },
			end: { x: 20, y: 35, h: 4, t: 0.5 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray starts outside the shape, then enters the top plane", () => {
		const intersections = rectangle.getIntersections({ x: 30, y: 40, h: 5 }, { x: 10, y: 30, h: 3 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 20, y: 35, h: 4, t: 0.5 },
			end: { x: 10, y: 30, h: 3, t: 1 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray starts inside the shape, then exits the bottom plane", () => {
		const intersections = rectangle.getIntersections({ x: 10, y: 30, h: 3 }, { x: 30, y: 40, h: 1 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 10, y: 30, h: 3, t: 0 },
			end: { x: 20, y: 35, h: 2, t: 0.5 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray starts outside the shape, then enters the bottom plane", () => {
		const intersections = rectangle.getIntersections({ x: 30, y: 40, h: 1 }, { x: 10, y: 30, h: 3 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 20, y: 35, h: 2, t: 0.5 },
			end: { x: 10, y: 30, h: 3, t: 1 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray starts and ends inside the shape", () => {
		const intersections = rectangle.getIntersections({ x: 30, y: 10, h: 2.5 }, { x: 80, y: 15, h: 3.5 }, true);

		assert.deepEqual(intersections, [{
			start: { x: 30, y: 10, h: 2.5, t: 0 },
			end: { x: 80, y: 15, h: 3.5, t: 1 },
			skimmed: false
		}]);
	});

	it("should produce expected intersection when the ray enters through a side, then ")

	// TODO: add additional test cases for when the test ray perfectly meets an edge at the top or bottom of the shape (including meeting an edge of a hole at top or bottom)

	// TODO: add additional test cases for more complex shapes where multiple intersections can happen (including holes)
});
