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
