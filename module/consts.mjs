export const moduleName = "terrain-height-tools";

/** @enum {keyof typeof tools} */
export const tools = /** @type {const} */ ({
	paint: "paint",
	fill: "fill",
	erase: "erase",
	eraseFill: "eraseFill"
});

/** @enum {keyof typeof settings} */
export const settings = /** @type {const} */ ({
	showTerrainHeightOnTokenLayer: "showTerrainHeightOnTokenLayer",
	terrainHeightLayerVisibilityRadius: "terrainHeightLayerVisibilityRadius",
	terrainTypes: "terrainTypes"
});

/** @enum {keyof typeof keybindings} */
export const keybindings = /** @type {const} */ ({
	toggleTerrainHeightMapOnTokenLayer: "toggleTerrainHeightMapOnTokenLayer"
});
