import { registerSceneControls, renderTerrainHeightPalette } from "./config/controls.mjs";
import { registerKeybindings } from "./config/keybindings.mjs";
import { registerSettings } from "./config/settings.mjs";
import { TerrainHeightLayer } from "./layers/terrain-height-layer.mjs";
import { log } from "./utils/log.mjs";

Hooks.on("init", init);
Hooks.on("getSceneControlButtons", registerSceneControls);
Hooks.on("renderSceneControls", renderTerrainHeightPalette);

function init() {
	log("Initialising");

	registerSettings();

	registerKeybindings();

	CONFIG.Canvas.layers.terrainHeightLayer = { group: "interface", layerClass: TerrainHeightLayer };
}
