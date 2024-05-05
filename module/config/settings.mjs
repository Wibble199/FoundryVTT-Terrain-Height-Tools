import { TerrainTypesConfig } from "../applications/terrain-types-config.mjs";
import { moduleName, settings } from "../consts.mjs";
import { sceneControls } from "./controls.mjs";

export function registerSettings() {
	game.settings.register(moduleName, settings.showTerrainHeightOnTokenLayer, {
		name: "SETTINGS.ShowTerrainHeightOnTokenLayer",
		scope: "client",
		type: Boolean,
		config: false,
		default: true,
		onChange: value => game.canvas.terrainHeightLayer._graphics.setVisible(value)
	});

	game.settings.register(moduleName, settings.terrainHeightLayerVisibilityRadius, {
		name: "SETTINGS.TerrainHeightLayerVisibilityRadius.Name",
		hint: "SETTINGS.TerrainHeightLayerVisibilityRadius.Hint",
		scope: "client",
		type: Number,
		range: { min: 0, max: 40, step: 1 },
		config: true,
		default: 0,
		onChange: value => game.canvas.terrainHeightLayer._graphics._setMaskRadius(value)
	});

	game.settings.registerMenu(moduleName, settings.terrainTypes, {
		name: "SETTINGS.TerrainTypes.Name",
		label: "SETTINGS.TerrainTypes.Button",
		hint: "SETTINGS.TerrainTypes.Hint",
		icon: "fas fa-paintbrush",
		type: TerrainTypesConfig,
		restricted: true
	});

	game.settings.register(moduleName, settings.terrainTypes, {
		name: "SETTINGS.TerrainTypes.Name",
		scope: "world",
		default: [],
		type: Array,
		config: false,
		onChange: () => {
			sceneControls.terrainHeightPalette?.render(false);
			game.canvas.terrainHeightLayer._updateGraphics();
		}
	});
}
