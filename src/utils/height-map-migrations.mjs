import { groupBy } from "./array-utils.mjs";
import { polygonsFromGridCells } from "./grid-utils.mjs";
import { error } from "./log.mjs";

/**
 * @template {number} V
 * @template T
 * @typedef {{ v: V, data: T }} Versioned
*/

/** @typedef {{ terrainTypeId: string; elevation: number; height: number; position: [number, number] }[]} HeightMapDataV0 */

/**
 * @typedef {Versioned<1, { [position: string]: HeightMapDataV1Terrain[] }>} HeightMapDataV1
 */
/**
 * @typedef {Object} HeightMapDataV1Terrain
 * @property {string} terrainTypeId
 * @property {number} height
 * @property {number} elevation
*/

/**
 * @typedef {Versioned<2, [string, HeightMapDataV1Terrain[]][]>} HeightMapDataV2
 */

/**
 * @typedef {Versioned<3, { shapes: HeightMapV3Shape[] }>} HeightMapDataV3
 */
/**
 * @typedef {Object} HeightMapV3Shape
 * @property {string} terrainTypeId
 * @property {{ x: number; y: number; }[]} polygon
 * @property {{ x: number; y: number; }[][]} holes
 * @property {number} height
 * @property {number} elevation
 */

export const DATA_VERSION = 3;

const migrations = [
	// v0 -> v1
	/** @type {(data: HeightMapDataV0) => HeightMapDataV1} */
	data => ({
		v: 1,
		data: Object.fromEntries(data.map(d => [
			`${d.position[0]}|${d.position[1]}`, // do not use encodeCellKey here in case it is changed in future and changes how the migration works
			[{
				terrainTypeId: d.terrainTypeId,
				height: d.height,
				elevation: d.elevation ?? 0
			}]
		]))
	}),

	// v1 -> v2
	/** @type {(data: HeightMapDataV1) => HeightMapDataV2} */
	data => ({
		v: 2,
		data: Object.entries(data.data)
	}),

	// v2 -> v3
	/** @type {(data: HeightMapDataV2, grid: BaseGrid) => HeightMapDataV3} */
	(data, grid) => {
		// Get a flattened list of all cells and the terrain in those cells
		const flattenedCells = data.data.flatMap(([coord, terrains]) => {
			const pos = coord.split("|").map(n => parseInt(n)); // do not use decodeCellKey here in case it is changed in future and changes how the migration works
			return terrains.map(terrain => ({ pos, ...terrain }));
		});

		// Group cells by the terrain attributes
		const cellsByAttributes = groupBy(flattenedCells, x => `${x.terrainTypeId}|${x.height}|${x.elevation}`);

		// For each terrain group, work out the shapes for that terrain
		/** @type {HeightMapV3Shape[]} */
		const finalShapes = [];
		for (const [, cells] of cellsByAttributes) {
			const { terrainTypeId, height, elevation } = cells[0];
			for (const { polygon, holes } of polygonsFromGridCells(cells.map(cell => cell.pos), grid)) {
				finalShapes.push({
					terrainTypeId,
					polygon: polygon.toObject(),
					holes: holes.map(h => h.toObject()),
					height,
					elevation
				});
			}
		}

		return {
			v: 3,
			data: {
				shapes: finalShapes
			}
		};
	}
];

/**
 * Migrates the given data to the latest version.
 * @param {Versioned<number, any> | HeightMapDataV0 | undefined | null} data
 * @param {BaseGrid} grid
 * @param {number} targetVersion
 * @returns {HeightMapDataV3}
 */
export function migrateData(data, grid, targetVersion = DATA_VERSION) {
	// If there is no data, return a blank map
	if (!data) {
		switch (targetVersion) {
			case 1: return { v: 1, data: {} };
			case 2: return { v: 2, data: [] };
			case 3: return { v: 3, data: { shapes: [] } };
			default: throw new Error(`Unknown/unsupported targetVersion '${targetVersion}'`);
		}
	}

	// Try to get the `v` value from the data. If there is no `v` value, then treat it as v0. Then, sequentially apply
	// all the migrations from that version to the current version.
	for (let v = ("v" in data ? data.v : 0); v < targetVersion; v++) {
		try {
			data = migrations[v](data, grid);
		} catch (ex) {
			ui.notifications.error(`[Terrain Height Tools] Error occured migrating data (v${v} -> v${v + 1}). Check console for details.`);
			error(ex);
			throw new Error(`Error occured migrating data: ${ex.message}`, { cause: ex });
		}
	}

	return data;
}
