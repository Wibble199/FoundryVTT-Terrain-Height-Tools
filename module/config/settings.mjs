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
}
