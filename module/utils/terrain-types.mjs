import { lineTypes, moduleName, settings } from '../consts.mjs';

/**
 * @typedef {object} TerrainType
 * @property {string} id
 * @property {string} name
 * @property {boolean} usesHeight
 * @property {boolean} textRotation
 * @property {lineTypes} lineType
 * @property {number} lineWidth
 * @property {string} lineColor
 * @property {number} lineOpacity
 * @property {number} lineDashSize
 * @property {number} lineGapSize
 * @property {number} fillType
 * @property {string} fillColor
 * @property {number} fillOpacity
 * @property {string} fillTexture
 * @property {string} textFormat
 * @property {string} font
 * @property {number} textSize
 * @property {string} textColor
 * @property {number} textOpacity
 */

/**
 * Creates a new TerrainType object with the default options.
 * @returns {TerrainType}
 */
export function createDefaultTerrainType() {
	return {
		id: randomID(),
		name: "New Terrain Type",
		usesHeight: true,
		textRotation: false,
		lineType: lineTypes.solid,
		lineWidth: 4,
		lineColor: "#FF0000",
		lineOpacity: 0.8,
		lineDashSize: 15,
		lineGapSize: 10,
		fillType: CONST.DRAWING_FILL_TYPES.SOLID,
		fillColor: "#FF0000",
		fillOpacity: 0.2,
		fillTexture: "",
		textFormat: "",
		font: CONFIG.defaultFontFamily,
		textSize: 48,
		textColor: "#FFFFFF",
		textOpacity: 1
	};
}

/**
 * Loads the TerrainTypes from the settings.
 * @returns {TerrainType[]}
 */
export function getTerrainTypes() {
	/** @type {Partial<TerrainType>[]} */
	const terrainTypes = game.settings.get(moduleName, settings.terrainTypes);

	// Merge with the default terrain type so that any new properties get their default values.
	return terrainTypes.map(t => ({ ...createDefaultTerrainType(), ...t }));
}

/**
 * Loads the TerrainTypes from the settings into a Map that is keyed by the terrain type ID.
 */
export function getTerrainTypeMap() {
	return new Map(getTerrainTypes().map(t => [t.id, t]));
}

/**
 * Returns the terrain type for the given ID.
 * @param {string} terrainTypeId
 * @returns {TerrainType | undefined}
 */
export function getTerrainType(terrainTypeId) {
	return getTerrainTypes().find(x => x.id === terrainTypeId);
}
