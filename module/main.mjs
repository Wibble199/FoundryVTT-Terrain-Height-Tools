import * as api from './api.mjs';
import { registerSceneControls, renderTerrainHeightPalette } from "./config/controls.mjs";
import { registerKeybindings } from "./config/keybindings.mjs";
import { addAboveTilesToSceneConfig, registerSettings } from './config/settings.mjs';
import { LineOfSightRulerLayer } from './layers/line-of-sight-ruler-layer.mjs';
import { TerrainHeightLayer } from "./layers/terrain-height-layer.mjs";
import { log } from "./utils/log.mjs";

Hooks.on("init", init);
Hooks.on("getSceneControlButtons", registerSceneControls);
Hooks.on("renderSceneControls", renderTerrainHeightPalette);
Hooks.on("renderSceneConfig", addAboveTilesToSceneConfig);

function init() {
	log("Initialising");

	globalThis.terrainHeightTools = { ...api };

	registerSettings();

	registerKeybindings();

	CONFIG.Canvas.layers.terrainHeightLayer = { group: "interface", layerClass: TerrainHeightLayer };
	CONFIG.Canvas.layers.terrainHeightLosRulerLayer = { group: "interface", layerClass: LineOfSightRulerLayer };

	// Could not find a nice way of hooking into the undo functionality when the TerrainHeightLayer is not
	// a PlaceablesLayer, so we monkey patch the static ClientKeybindings._onUndo to add our own code there.
	const previousOnUndo = ClientKeybindings._onUndo;
	ClientKeybindings._onUndo = (context) => {
		if (!canvas.ready) return false;

		if (canvas.activeLayer instanceof TerrainHeightLayer && canvas.activeLayer.canUndo) {
			canvas.activeLayer.undo();
			return true;
		}

		return previousOnUndo(context);
	}
}
