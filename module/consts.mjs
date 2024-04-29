export const moduleName = "terrain-height-tools";

/** @enum {keyof typeof tools} */
export const tools = /** @type {const} */ ({
	paint: "paint",
	fill: "fill",
	erase: "erase"
});

/** @enum {keyof typeof settings} */
export const settings = /** @type {const} */ ({
	showTerrainHeightOnTokenLayer: "showTerrainHeightOnTokenLayer"
});
