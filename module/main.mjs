import * as api from './api.mjs';
import { registerSceneControls, renderTerrainHeightPalette } from "./config/controls.mjs";
import { registerKeybindings } from "./config/keybindings.mjs";
import { addAboveTilesToSceneConfig, registerSettings } from './config/settings.mjs';
import { moduleName, socketlibFuncs } from './consts.mjs';
import { LineOfSightRulerLayer } from './layers/line-of-sight-ruler-layer.mjs';
import { TerrainHeightLayer } from "./layers/terrain-height-layer.mjs";
import { log } from "./utils/log.mjs";

Hooks.once("init", init);
Hooks.once("ready", ready);
Hooks.once("socketlib.ready", initSocketlib);
Hooks.on("getSceneControlButtons", registerSceneControls);
Hooks.on("renderSceneControls", renderTerrainHeightPalette);
Hooks.on("renderSceneConfig", addAboveTilesToSceneConfig);

Object.defineProperty(globalThis, "terrainHeightTools", {
	value: { ...api },
	writable: false
});

function init() {
	log("Initialising");

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

function ready() {
	// Warn if socketlib is not installed/enabled (has to be done in ready not init, as user does not exist at init)
	if (game.user.isGM && game.modules.get("socketlib")?.active !== true) {
		ui.notifications.warn(game.i18n.localize("TERRAINHEIGHTTOOLS.SocketLibWarning"));
	}
}

function initSocketlib() {
	const socket = globalThis.terrainHeightTools.socket = socketlib.registerModule(moduleName);

	socket.register(socketlibFuncs.drawLineOfSightRay, (...args) =>
		canvas.terrainHeightLosRulerLayer?._drawLineOfSightRay(...args));

	socket.register(socketlibFuncs.clearLineOfSightRay, (...args) =>
		canvas.terrainHeightLosRulerLayer?._clearLineOfSightRay(...args));
}
