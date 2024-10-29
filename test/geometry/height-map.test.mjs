/** @import { HeightMapDataV1Terrain } from "../../module/utils/height-map-migrations.mjs" */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HeightMap } from "../../module/geometry/height-map.mjs";

describe("HeightMap::_eraseTerrainDataBetween()", () => {
	it("should clip the top of existing terrain that extends within the given range", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 1, height: 9 }];
		const anyChanges = HeightMap._eraseTerrainDataBetween(data, 5, 10);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 1, height: 4 }]);
	});

	it("should clip the bottom of existing terrain that extends within the given range", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 2, height: 2 }];
		const anyChanges = HeightMap._eraseTerrainDataBetween(data, 1, 3);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 3, height: 1 }]);
	});

	it("should remove existing terrain that exists entirely within the range", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 5, height: 10 }];
		const anyChanges = HeightMap._eraseTerrainDataBetween(data, 0, 100);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, []);
	});

	it("should remove existing terrain that exists entirely within the range (inclusive)", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 5, height: 3 }];
		const anyChanges = HeightMap._eraseTerrainDataBetween(data, 5, 8);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, []);
	});

	it("should split existing terrain that entirely contains the range", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 2, height: 9 }];
		const anyChanges = HeightMap._eraseTerrainDataBetween(data, 4, 6);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 2, height: 2 }, { terrainTypeId: "a", elevation: 6, height: 5 }]);
	});

	it("should not alter terrain that does not fall within the range", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 10, height: 5 }];
		const anyChanges = HeightMap._eraseTerrainDataBetween(data, 3, 6);

		assert.equal(anyChanges, false);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 10, height: 5 }]);
	});

	it("should not alter terrain whose ID is in `excludingTerrainTypeIds`", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 0, height: 10 }, { terrainTypeId: "b", elevation: 4, height: 2 }];
		const anyChanges = HeightMap._eraseTerrainDataBetween(data, 2, 8, ["a", "b"]);

		assert.equal(anyChanges, false);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 0, height: 10 }, { terrainTypeId: "b", elevation: 4, height: 2 }]);
	});
});

describe("HeightMap::_insertTerrainDataAndMerge()", () => {
	it("should insert new terrain when no existing terrain present", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 3, 2);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 3, height: 2 }]);
	});

	it("should merge with adjacent terrain from below", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 1, height: 2 }];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 3, 2);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 1, height: 4 }]);
	});

	it("should merge with overlapping terrain from below", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 2, height: 3 }];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 3, 4);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 2, height: 5 }]);
	});

	it("should merge with adjacent terrain from above", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 10, height: 0.5 }];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 9, 1);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 9, height: 1.5 }]);
	});

	it("should merge with overlapping terrain from above", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 4, height: 5 }];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 1, 6);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 1, height: 8 }]);
	});

	it("should merge with overlapping terrain from above and below", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [
			{ terrainTypeId: "a", elevation: 2, height: 3 },
			{ terrainTypeId: "a", elevation: 6, height: 3 }
		];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 4, 2);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 2, height: 7 }]);
	});

	it("should merge with existing terrain completely inside the new range", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 5, height: 2 }];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 2, 10);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 2, height: 10 }]);
	});

	it("should merge with multiple existing terrain completely inside the new range", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [
			{ terrainTypeId: "a", elevation: 10, height: 4 },
			{ terrainTypeId: "a", elevation: 20, height: 8 },
			{ terrainTypeId: "a", elevation: 50, height: 16 },
			{ terrainTypeId: "a", elevation: 70, height: 19 },
		];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 0, 100);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 0, height: 100 }]);
	});

	it("should merge with overlapping terrain from above and below and with existing terrain completely inside", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [
			{ terrainTypeId: "a", elevation: 1, height: 2 }, // 1->3
			{ terrainTypeId: "a", elevation: 4, height: 2 }, // 4->6
			{ terrainTypeId: "a", elevation: 7, height: 2 }  // 7->9
		];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 2, 6);

		assert.equal(anyChanges, true);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 1, height: 8 }]);
	});

	it("should not merge with non-adjacent terrain", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [
			{ terrainTypeId: "a", elevation: 1, height: 3 },
			{ terrainTypeId: "a", elevation: 15, height: 1 }
		];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 5, 5);

		assert.equal(anyChanges, true);
		assert.deepEqual(data.sort((a, b) => a.elevation - b.elevation), [
			{ terrainTypeId: "a", elevation: 1, height: 3 },
			{ terrainTypeId: "a", elevation: 5, height: 5 },
			{ terrainTypeId: "a", elevation: 15, height: 1 }
		]);
	});

	it("should not merge with other terrain types", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "b", elevation: 4, height: 5 }];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 5, 12);

		assert.equal(anyChanges, true);
		assert.deepEqual(data.sort((a, b) => a.elevation - b.elevation), [
			{ terrainTypeId: "b", elevation: 4, height: 5 },
			{ terrainTypeId: "a", elevation: 5, height: 12 }
		]);
	});

	it("should not change when existing terrain already exists at required elevation/height", () => {
		/** @type {HeightMapDataV1Terrain[]} */
		const data = [{ terrainTypeId: "a", elevation: 10, height: 10 }];
		const anyChanges = HeightMap._insertTerrainDataAndMerge(data, "a", 12, 6);

		assert.equal(anyChanges, false);
		assert.deepEqual(data, [{ terrainTypeId: "a", elevation: 10, height: 10 }]);
	});
});
