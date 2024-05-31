export const moduleName = "terrain-height-tools";

/** The allowable tolerance of angles of lines to treat them as parallel. */
export const anglePrecision = 0.06;

/** The allowable tolerance of edges for determining if an intersection was an edge or vertex intersection.
 * This is measured as a proportion of a grid cells's edge, which is approximately equal to grid size. */
export const edgeIntersectionTolerance = 0.04;

/** @enum {keyof typeof tools} */
export const tools = /** @type {const} */ ({
	paint: "paint",
	fill: "fill",
	erase: "erase",
	eraseFill: "eraseFill",
	lineOfSight: "terrainHeightToolsLineOfSight"
});

/** @enum {keyof typeof settings} */
export const settings = /** @type {const} */ ({
	showTerrainHeightOnTokenLayer: "showTerrainHeightOnTokenLayer",
	smartLabelPlacement: "smartLabelPlacement",
	terrainHeightLayerVisibilityRadius: "terrainHeightLayerVisibilityRadius",
	terrainLayerAboveTilesDefault: "terrainLayerAboveTilesDefault",
	terrainTypes: "terrainTypes"
});

/** @enum {keyof typeof keybindings} */
export const keybindings = /** @type {const} */ ({
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
