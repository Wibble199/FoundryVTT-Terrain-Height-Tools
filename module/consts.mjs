export const moduleName = "terrain-height-tools";

export const socketName = `module.${moduleName}`;


/** @enum {keyof typeof tools} */
export const tools = /** @type {const} */ ({
	paint: "paint",
	fill: "fill",
	pipette: "pipette",
	erase: "erase",
	eraseFill: "eraseFill",
	lineOfSight: "terrainHeightToolsLineOfSight",
	tokenLineOfSight: "terrainHeightToolsTokenLineOfSight",
	toDrawing: "toDrawing",
	toWalls: "toWalls"
});

/** @enum {keyof typeof settings} */
export const settings = /** @type {const} */ ({
	defaultTokenLosTokenHeight: "defaultTokenLosTokenHeight",
	deleteShapeAfterConvert: "deleteShapeAfterConvert",
	displayLosMeasurementGm: "displayLosMeasurementGm",
	displayLosMeasurementPlayer: "displayLosMeasurementPlayer",
	otherUserLineOfSightRulerOpacity: "otherUserLineOfSightRulerOpacity",
	showTerrainHeightOnTokenLayer: "showTerrainHeightOnTokenLayer",
	smartLabelPlacement: "smartLabelPlacement",
	terrainHeightLayerVisibilityRadius: "terrainHeightLayerVisibilityRadius",
	terrainLayerAboveTilesDefault: "terrainLayerAboveTilesDefault",
	terrainTypes: "terrainTypes",
	tokenElevationChange: "tokenElevationChange",
	tokenLosToolPreselectToken1: "tokenLosToolPreselectToken1",
	tokenLosToolPreselectToken2: "tokenLosToolPreselectToken2",
	useFractionsForLabels: "useFractionsForLabels"
});

/** @enum {keyof typeof keybindings} */
export const keybindings = /** @type {const} */ ({
	decreaseLosRulerHeight: "decreaseLosRulerHeight",
	increaseLosRulerHeight: "increaseLosRulerHeight",
	toggleTerrainHeightMapOnTokenLayer: "toggleTerrainHeightMapOnTokenLayer"
});

/** @enum {keyof typeof flags} */
export const flags = /** @type {const} */ ({
	heightData: "heightData",
	terrainLayerAboveTiles: "terrainLayerAboveTiles"
});

/** @enum {number} */
export const lineTypes = ({
	none: 0,
	solid: 1,
	dashed: 2
});

/** @enum {keyof typeof socketFuncs} */
export const socketFuncs = /** @type {const} */ ({
	drawLineOfSightRay: "drawLineOfSightRay",
	clearLineOfSightRay: "clearLineOfSightRay"
});

/** @enum {keyof typeof tokenRelativeHeights} */
export const tokenRelativeHeights = /** @type {const} */ ({
	[1]: "SETTINGS.DefaultTokenLosHeight.Choice.Top",
	[0.5]: "SETTINGS.DefaultTokenLosHeight.Choice.Middle",
	[0]: "SETTINGS.DefaultTokenLosHeight.Choice.Bottom",
});
