import * as api from './api.mjs';
import { registerSceneControls, renderToolSpecificApplications, sceneControls } from "./config/controls.mjs";
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
Hooks.on("renderSceneControls", renderToolSpecificApplications);
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

	if (libWrapper) initLibWrapper();
}

function ready() {
	// Warn if module dependencies are missing (has to be done in ready not init, as user does not exist at init)
	const hasMissingDep = game.user.isGM && (
		game.modules.get("lib-wrapper")?.active !== true ||
		game.modules.get("socketlib")?.active !== true
	);
	if (hasMissingDep) {
		ui.notifications.error(game.i18n.localize("TERRAINHEIGHTTOOLS.MissingDependencyWarning"), { permanent: true });
	}
}

function initLibWrapper() {
	// Patch to allow the Undo keybinding to work for the Terrain Height Layer
	libWrapper.register(moduleName, "ClientKeybindings._onUndo", function(wrapped, ...args) {
		const layer = canvas.ready && canvas.activeLayer;
		if (layer instanceof TerrainHeightLayer && layer.canUndo) {
			layer.undo();
			return true;
		}

		return wrapped(...args);
	}, libWrapper.MIXED);

	// Patch to allow clicking on a token to select it for the token line of sight
	// Since players are not allowed to click on tokens they do not own (in which case `_onClickLeft` does not even get
	// called) we also need to override the `can` method to allow players to click tokens they don't own when using the
	// token LoS tool. Feels dirty, but hey, whatever works, right?
	libWrapper.register(moduleName, "Token.prototype._onClickLeft", function(wrapped, ...args) {
		if (sceneControls.tokenLineOfSightConfig?._isSelecting) {
			sceneControls.tokenLineOfSightConfig._onSelectToken(this);
			return;
		}
		wrapped(...args);
	}, libWrapper.MIXED);

	libWrapper.register(moduleName, "MouseInteractionManager.prototype.can", function(wrapped, action, event) {
		if (action === "clickLeft" && sceneControls.tokenLineOfSightConfig?._isSelecting)
			return true;
		return wrapped(action, event);
	}, libWrapper.MIXED);
}

function initSocketlib() {
	const socket = globalThis.terrainHeightTools.socket = socketlib.registerModule(moduleName);

	socket.register(socketlibFuncs.drawLineOfSightRay, (...args) => {
		/** @type {import("./layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer | undefined} */
		const losRulerLayer = canvas.terrainHeightLosRulerLayer;
		losRulerLayer?._drawLineOfSightRays(...args);
	});

	socket.register(socketlibFuncs.clearLineOfSightRay, (...args) => {
		/** @type {import("./layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer | undefined} */
		const losRulerLayer = canvas.terrainHeightLosRulerLayer;
		losRulerLayer?._clearLineOfSightRays(...args);
	});
}
