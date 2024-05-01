import { moduleName, settings } from "../consts.mjs";

export function registerSettings() {
	game.settings.register(moduleName, settings.showTerrainHeightOnTokenLayer, {
		name: "SETTINGS.ShowTerrainHeightOnTokenLayer",
		scope: "client",
		type: Boolean,
		config: false,
		default: true,
		onChange: value => game.canvas.terrainHeightLayer.graphics.setVisible(value)
	});

	game.settings.register(moduleName, settings.terrainHeightLayerVisibilityRadius, {
		name: "SETTINGS.TerrainHeightLayerVisibilityRadius.Name",
		hint: "SETTINGS.TerrainHeightLayerVisibilityRadius.Hint",
		scope: "client",
		type: Number,
		range: { min: 0, max: 40, step: 1 },
		config: true,
		default: 0,
		onChange: value => game.canvas.terrainHeightLayer.graphics._setMaskRadius(value)
	});
}
