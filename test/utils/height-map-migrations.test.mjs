/** @import { HeightMapDataV0, HeightMapDataV1 } from "../../module/utils/height-map-migrations.mjs" */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migrateData } from "../../module/utils/height-map-migrations.mjs";

describe("migrateData()", () => {
	it("should correctly migrate v0 to v1 data", () => {
		/** @type {HeightMapDataV0} */
		const v0Data = [
			{
				terrainTypeId: "abc",
				height: 3,
				elevation: 1,
				position: [0, 0]
			},
			// Missing elevation should default to 0
			// @ts-ignore
			{
				terrainTypeId: "abc",
				height: 1,
				position: [1, 0]
			},
			{
				terrainTypeId: "def",
				height: 100,
				elevation: 99,
				position: [10, 20]
			}
		];

		/** @type {HeightMapDataV1} */
		const v1DataExpected = {
			"0|0": [
				{
					terrainTypeId: "abc",
					height: 3,
					elevation: 1
				}
			],
			"1|0": [
				{
					terrainTypeId: "abc",
					height: 1,
					elevation: 0
				}
			],
			"10|20": [
				{
					terrainTypeId: "def",
					height: 100,
					elevation: 99
				}
			]
		};

		const v1DataActual = migrateData(v0Data, 1);

		assert.deepEqual(v1DataActual, v1DataExpected);
	});

	it("should correctly initialise a blank HeightMapDataV1 when given undefined", () => {
		const blank = migrateData(undefined);
		assert.deepEqual(blank, {});
	});

	it("should correctly initialise a blank HeightMapDataV1 when given null", () => {
		const blank = migrateData(null);
		assert.deepEqual(blank, {});
	});
});
