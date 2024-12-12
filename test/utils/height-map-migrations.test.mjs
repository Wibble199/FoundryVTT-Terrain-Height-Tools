/** @import { HeightMapDataV0, HeightMapDataV1, HeightMapDataV2 } from "../../module/utils/height-map-migrations.mjs" */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migrateData } from "../../module/utils/height-map-migrations.mjs";

describe("migrateData()", () => {
	it("should correctly migrate pass v2 data through unchanged", () => {
		/** @type {HeightMapDataV2} */
		const v2Data = {
			v: 2,
			data: [
				["0|0", [
					{
						terrainTypeId: "abc",
						height: 1,
						elevation: 3
					}
				]],
				["0|1", [
					{
						terrainTypeId: "abc",
						height: 1,
						elevation: 3
					},
					{
						terrainTypeId: "bcd",
						height: 2,
						elevation: 0
					}
				]]
			]
		};

		/** @type {HeightMapDataV2} */
		const v2DataExpected = {
			v: 2,
			data: [
				["0|0", [
					{
						terrainTypeId: "abc",
						height: 1,
						elevation: 3
					}
				]],
				["0|1", [
					{
						terrainTypeId: "abc",
						height: 1,
						elevation: 3
					},
					{
						terrainTypeId: "bcd",
						height: 2,
						elevation: 0
					}
				]]
			]
		};

		const v2DataActual = migrateData(v2Data);

		assert.deepEqual(v2DataActual, v2DataExpected);
	});

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
			v: 1,
			data: {
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
			}
		};

		const v1DataActual = migrateData(v0Data, 1);

		assert.deepEqual(v1DataActual, v1DataExpected);
	});

	it("should correctly migrate v0 to v2 data", () => {
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

		/** @type {HeightMapDataV2} */
		const v2DataExpected = {
			v: 2,
			data: [
				["0|0", [
					{
						terrainTypeId: "abc",
						height: 3,
						elevation: 1
					}
				]],
				["1|0", [
					{
						terrainTypeId: "abc",
						height: 1,
						elevation: 0
					}
				]],
				["10|20", [
					{
						terrainTypeId: "def",
						height: 100,
						elevation: 99
					}
				]]
			]
		};

		const v2DataActual = migrateData(v0Data);

		assert.deepEqual(v2DataActual, v2DataExpected);
	});

	it("should correctly migrate v1 to v2 data", () => {
		/** @type {HeightMapDataV1} */
		const v1Data = {
			v: 1,
			data: {
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
			}
		};

		/** @type {HeightMapDataV2} */
		const v2DataExpected = {
			v: 2,
			data: [
				["0|0", [
					{
						terrainTypeId: "abc",
						height: 3,
						elevation: 1
					}
				]],
				["1|0", [
					{
						terrainTypeId: "abc",
						height: 1,
						elevation: 0
					}
				]],
				["10|20", [
					{
						terrainTypeId: "def",
						height: 100,
						elevation: 99
					}
				]]
			]
		};

		const v2DataActual = migrateData(v1Data, 2);

		assert.deepEqual(v2DataActual, v2DataExpected);
	});

	it("should correctly initialise a blank HeightMapDataV1 when given undefined", () => {
		const blank = migrateData(undefined);
		assert.deepEqual(blank, { v: 2, data: [] });
	});

	it("should correctly initialise a blank HeightMapDataV1 when given null", () => {
		const blank = migrateData(null);
		assert.deepEqual(blank, { v: 2, data: [] });
	});
});
