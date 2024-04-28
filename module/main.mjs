import TerrainHeightLayer from "./layers/terrain-height-layer.mjs";
import { log } from "./utils/log.mjs";
import { registerSceneControls } from "./config/controls.mjs";
import { registerSettings } from "./config/settings.mjs";

Hooks.on("init", init);
Hooks.on("getSceneControlButtons", registerSceneControls);

function init() {
	log("Initialising");

	registerSettings();

	CONFIG.Canvas.layers.terrainHeightLayer = { group: "interface", layerClass: TerrainHeightLayer };

	CONFIG.debug.terrainHeightLayer = true;
}
