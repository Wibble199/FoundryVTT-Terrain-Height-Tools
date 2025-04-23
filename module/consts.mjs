export const moduleName = "terrain-height-tools";

export const socketName = `module.${moduleName}`;

export const defaultGroupName = "default";

export const wallHeightModuleName = "wall-height";

/** @enum {keyof typeof tools} */
export const tools = /** @type {const} */ ({
	paint: "paint",
	pipette: "pipette",
	erase: "erase",
	eraseShape: "eraseShape",
	lineOfSight: "terrainHeightToolsLineOfSight",
	tokenLineOfSight: "terrainHeightToolsTokenLineOfSight",
	convert: "convert",
	terrainVisibility: "terrainVisibility"
});

/** @enum {keyof typeof settings} */
export const settings = /** @type {const} */ ({
	defaultTokenLosTokenHeight: "defaultTokenLosTokenHeight",
	displayLosMeasurementGm: "displayLosMeasurementGm",
	displayLosMeasurementPlayer: "displayLosMeasurementPlayer",
	otherUserLineOfSightRulerOpacity: "otherUserLineOfSightRulerOpacity",
	showTerrainHeightOnTokenLayer: "showTerrainHeightOnTokenLayer",
	showTerrainStackViewerOnTokenLayer: "showTerrainStackViewerOnTokenLayer",
	smartLabelPlacement: "smartLabelPlacement",
	terrainHeightLayerVisibilityRadius: "terrainHeightLayerVisibilityRadius",
	terrainLayerAboveTilesDefault: "terrainLayerAboveTilesDefault",
	terrainStackViewerDisplayMode: "terrainStackViewerDisplayMode",
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
	showTerrainStack: "showTerrainStack",
	toggleTerrainHeightMapOnTokenLayer: "toggleTerrainHeightMapOnTokenLayer"
});

/** @enum {keyof typeof flags} */
export const flags = /** @type {const} */ ({
	heightData: "heightData",
	invisibleTerrainTypes: "invisibleTerrainTypes",
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

/** @enum {keyof typeof terrainPaintMode} */
export const terrainPaintMode = /** @type {const} */ ({
	additiveMerge: "TERRAINHEIGHTTOOLS.PaintMode.AdditiveMerge.Name",
	destructiveMerge: "TERRAINHEIGHTTOOLS.PaintMode.DestructiveMerge.Name",
	totalReplace: "TERRAINHEIGHTTOOLS.PaintMode.TotalReplace.Name",
});

/** @enum {keyof typeof tokenRelativeHeights} */
export const tokenRelativeHeights = /** @type {const} */ ({
	[1]: "SETTINGS.DefaultTokenLosHeight.Choice.Top",
	[0.5]: "SETTINGS.DefaultTokenLosHeight.Choice.Middle",
	[0]: "SETTINGS.DefaultTokenLosHeight.Choice.Bottom",
});

/** @enum {keyof typeof terrainStackViewerDisplayModes} */
export const terrainStackViewerDisplayModes = /** @type {const} */ ({
	auto: "SETTINGS.TerrainStackViewerDisplayMode.Choice.Auto",
	proportional: "SETTINGS.TerrainStackViewerDisplayMode.Choice.Proportional",
	compact: "SETTINGS.TerrainStackViewerDisplayMode.Choice.Compact"
});
