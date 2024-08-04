import assert from "node:assert";
import { describe, it } from "node:test";
import { Polygon } from "../../module/geometry/polygon.mjs";

describe("Polygon::pairEdges()", () => {
	// Create a Polygon with some edges
	// This makes a sort of bow-tie like shape.
	const polygon = new Polygon([
		{ x: 10, y: 10 },
		{ x: 20, y: 10 },
		{ x: 30, y: 10 },
		{ x: 20, y: 20 },
		{ x: 30, y: 30 },
		{ x: 20, y: 30 },
		{ x: 10, y: 30 },
		{ x: 10, y: 20 }
	]);
	const edges = polygon.edges;

	it("Should correctly pair off edges that meet at an intersection", () => {
		const actual = polygon.pairEdges([edges[2], edges[7], edges[6], edges[3]]);
		const expected = [[edges[2], edges[3]], [edges[6], edges[7]]];
		assert.deepStrictEqual(actual, expected);
	});

	it("Should correctly pair off edges when the parameter edges do not wrap around the start point of the shape but the first edge is provided", () => {
		const actual = polygon.pairEdges([edges[1], edges[0], edges[2], edges[3]]);
		const expected = [[edges[0], edges[1]], [edges[2], edges[3]]];
		assert.deepStrictEqual(actual, expected);
	});

	it("Should correctly pair off edges when the parameter edges wrap around the start point of the shape and a pair does not span the start point", () => {
		const actual = polygon.pairEdges([edges[7], edges[4], edges[1], edges[6], edges[0], edges[5]]);
		const expected = [[edges[0], edges[1]], [edges[4], edges[5]], [edges[6], edges[7]]];
		assert.deepStrictEqual(actual, expected);
	});

	it("Should correctly pair off edges when the parameter edges wrap around the start point of the shape and a pair spans this start point", () => {
		const actual = polygon.pairEdges([edges[7], edges[4], edges[1], edges[0], edges[2], edges[3]]);
		const expected = [[edges[1], edges[2]], [edges[3], edges[4]], [edges[7], edges[0]]];
		assert.deepStrictEqual(actual, expected);
	});
});
