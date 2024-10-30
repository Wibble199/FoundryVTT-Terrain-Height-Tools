/**
 * @template {number} V
 * @template T
 * @typedef {{ v: V, data: T }} Versioned
*/

/** @typedef {{ terrainTypeId: string; elevation: number; height: number; position: [number, number] }[]} HeightMapDataV0 */

/**
 * @typedef {{ [position: string]: HeightMapDataV1Terrain[] }} HeightMapDataV1
 */
/**
 * @typedef {Object} HeightMapDataV1Terrain
 * @property {string} terrainTypeId
 * @property {number} height
 * @property {number} elevation
*/

export const DATA_VERSION = 1;

const migrations = [
	// v0 -> v1
	/** @type {(data: HeightMapDataV0) => HeightMapDataV1} */
	(data) => Object.fromEntries(data.map(d => [
		`${d.position[0]}|${d.position[1]}`, // do not use encodeCellKey here in case it is changed in future and changes how the migration works
		[{
			terrainTypeId: d.terrainTypeId,
			height: d.height,
			elevation: d.elevation ?? 0
		}]
	]))
];

/**
 * Migrates the given data to the latest version.
 * @param {Versioned<number, any> | HeightMapDataV0 | undefined | null} data
 * @returns {Versioned<1, HeightMapDataV1>}
 */
export function migrateData(data, targetVersion = DATA_VERSION) {
	// If there is no data, return a blank V1 map
	if (!data) {
		return { v: 1, data: {} };
	}

	// Try to get the `v` value from the data. If there is no `v` value, then treat it as v0. Then, sequentially apply
	// all the migrations from that version to the current version.
	for (let v = ("v" in data ? data.v : 0); v < targetVersion; v++) {
		try {
			data = migrations[v](data);
		} catch (ex) {
			ui.notifications.error(`[Terrain Height Tools] Error occured migrating data (v${v} -> v${v + 1}). Check console for details.`);
			console.error(ex);
			throw new Error(`Error occured migrating data: ${ex.message}`);
		}
	}

	return data;
}
