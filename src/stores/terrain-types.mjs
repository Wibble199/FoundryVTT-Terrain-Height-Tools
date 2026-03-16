/** @import { ReadonlySignal, Signal } from "@preact/signals-core"; */
import { computed, signal } from "@preact/signals-core";
import { flags, lineTypes, moduleName, settingNames } from "../consts.mjs";
import { alphaToHex } from "../utils/misc-utils.mjs";

/**
 * @typedef {object} TerrainType
 * @property {string} id
 * @property {string} name
 * @property {boolean} usesHeight
 * @property {boolean} isSolid
 * @property {boolean} isAlwaysVisible
 * @property {boolean} textRotation
 * @property {lineTypes} lineType
 * @property {number} lineWidth
 * @property {string} lineColor
 * @property {number} lineOpacity
 * @property {number} lineDashSize
 * @property {number} lineGapSize
 * @property {number} lineFadeDistance
 * @property {string} lineFadeColor
 * @property {number} lineFadeOpacity
 * @property {number} fillType
 * @property {string} fillColor
 * @property {number} fillOpacity
 * @property {string} fillTexture
 * @property {{ x: number; y: number; }} fillTextureOffset
 * @property {{ x: number; y: number; }} fillTextureScale
 * @property {string} textFormat
 * @property {string} elevatedTextFormat
 * @property {string} font
 * @property {number} textSize
 * @property {string} textColor
 * @property {number} textOpacity
 * @property {number} textStrokeThickness
 * @property {string} textStrokeColor
 * @property {number} textShadowAmount
 * @property {string} textShadowColor
 * @property {number} textShadowOpacity
 * @property {number | null} defaultHeight
 * @property {number | null} defaultElevation
 */

/** @type {Signal<readonly Readonly<TerrainType>[]>} */
export const terrainTypes$ = signal([]);
export const terrainTypeMap$ = computed(() => new Map(terrainTypes$.value.map(t => [t.id, t])));

export function loadTerrainTypes() {
	/** @type {Partial<TerrainType>[]} */
	const terrainTypes = game.settings.get(moduleName, settingNames.terrainTypes);

	// As we're sharing TerrainType instances, freeze them to prevent modification
	terrainTypes$.value = Object.freeze(terrainTypes
		.map(t => Object.freeze({ ...createDefaultTerrainType(t.id), ...t })));
}

/**
 * Creates a new TerrainType object with the default options.
 * @param {TerrainType["id"]} id
 * @returns {TerrainType}
 */
export function createDefaultTerrainType(id = undefined) {
	return {
		id: id ?? foundry.utils.randomID(),
		name: "New Terrain Type",
		usesHeight: true,
		isSolid: true,
		isAlwaysVisible: false,
		textRotation: false,
		lineType: lineTypes.solid,
		lineWidth: 4,
		lineColor: "#FF0000",
		lineOpacity: 0.8,
		lineDashSize: 15,
		lineGapSize: 10,
		lineFadeDistance: 0,
		lineFadeColor: "#FF0000",
		lineFadeOpacity: 0.4,
		fillType: CONST.DRAWING_FILL_TYPES.SOLID,
		fillColor: "#FF0000",
		fillOpacity: 0.2,
		fillTexture: "",
		fillTextureOffset: { x: 0, y: 0 },
		fillTextureScale: { x: 100, y: 100 },
		textFormat: "",
		elevatedTextFormat: "",
		font: CONFIG.defaultFontFamily,
		textSize: 48,
		textColor: "#FFFFFF",
		textOpacity: 1,
		textStrokeThickness: 4,
		textStrokeColor: "",
		textShadowAmount: 2,
		textShadowColor: "",
		textShadowOpacity: 1,
		defaultHeight: null,
		defaultElevation: null
	};
}

/**
 * Returns the terrain type for the given ID.
 * @param {string} terrainTypeId
 * @returns {TerrainType | undefined}
 */
export function getTerrainType(terrainTypeId) {
	return terrainTypeMap$.value.get(terrainTypeId);
}

/**
 * Gets a single colour used to represent the given terrain type.
 * @param {TerrainType} terrainType
 * @param {number} defaultColor
 * @returns {number}
 */
export function getTerrainColor(terrainType, defaultColor = 0x00FFFF) {
	// If the terrain type has a fill colour, use that
	if (terrainType?.fillOpacity > 0 && terrainType.fillType !== CONST.DRAWING_FILL_TYPES.NONE)
		return Color.from(terrainType.fillColor);

	// If the terrain type does not have a fill colour but has a border colour, use that
	if (terrainType?.lineWidth > 0 && terrainType.lineOpacity > 0)
		return Color.from(terrainType.lineColor);

	// Otherwise use a default
	return defaultColor;
}

/**
 * Returns the 8-digit hexadecimal colours for border, background and text color for the given terrain type.
 * @param {TerrainType} terrainType
 */
export function getCssColorsFor(terrainType) {
	return {
		color: terrainType.textColor + alphaToHex(terrainType.textOpacity),
		background: terrainType.fillType === CONST.DRAWING_FILL_TYPES.NONE
			? "transparent"
			: terrainType.fillColor + alphaToHex(terrainType.fillOpacity),
		borderColor: terrainType.lineType === lineTypes.none || terrainType.lineWidth <= 0
			? "transparent"
			: terrainType.lineColor + alphaToHex(terrainType.lineOpacity),
		borderWidth: terrainType.lineType === lineTypes.none
			? 0
			: terrainType.lineWidth
	};
}

/**
 * Updates the passed scene so that the specified terrainTypeId is either visible or invisible.
 * @param {Scene} scene
 * @param {string} terrainTypeId
 * @param {boolean} [force] Whether the terrain type should be visible or not. Or undefined to toggle.
 */
export async function setSceneTerrainTypeVisible(scene, terrainTypeId, force = undefined) {
	/** @type {string[]} */
	const invisibleSceneTerrainTypes = scene.getFlag(moduleName, flags.invisibleTerrainTypes) ?? [];

	if ((force === true || force === undefined) && !invisibleSceneTerrainTypes.includes(terrainTypeId))
		await scene.setFlag(moduleName, flags.invisibleTerrainTypes, [...invisibleSceneTerrainTypes, terrainTypeId]);
	else if ((force === false || force === undefined) && invisibleSceneTerrainTypes.includes(terrainTypeId))
		await scene.setFlag(moduleName, flags.invisibleTerrainTypes, invisibleSceneTerrainTypes.filter(t => t !== terrainTypeId));
}
