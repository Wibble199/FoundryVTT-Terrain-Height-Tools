import * as api from './api.mjs';
import { TerrainStackViewer } from "./applications/terrain-stack-viewer.mjs";
import { registerSceneControls, renderToolSpecificApplications, sceneControls } from "./config/controls.mjs";
import { registerKeybindings } from "./config/keybindings.mjs";
import { addAboveTilesToSceneConfig, registerSettings } from './config/settings.mjs';
import { moduleName, socketFuncs, socketName } from './consts.mjs';
import { handleTokenElevationChange, handleTokenPreCreation } from "./hooks/token-elevation.mjs";
import { LineOfSightRulerLayer } from './layers/line-of-sight-ruler-layer.mjs';
import { TerrainHeightLayer } from "./layers/terrain-height-layer.mjs";
import { log } from "./utils/log.mjs";

Hooks.once("init", init);
Hooks.once("ready", ready);
Hooks.on("getSceneControlButtons", registerSceneControls);
Hooks.on("renderSceneControls", renderToolSpecificApplications);
Hooks.on("renderSceneConfig", addAboveTilesToSceneConfig);
Hooks.on("preCreateToken", handleTokenPreCreation);
Hooks.on("preUpdateToken", handleTokenElevationChange);
Hooks.on("refreshToken", token => LineOfSightRulerLayer.current?._onTokenRefresh(token));

Object.defineProperty(globalThis, "terrainHeightTools", {
	value: {
		...api,
		ui: {
			/** @type {TerrainStackViewer} */
			terrainStackViewer: undefined
		}
	},
	writable: false
});

function init() {
	log("Initialising");

	registerSettings();

	registerKeybindings();

	CONFIG.Canvas.layers.terrainHeightLayer = { group: "interface", layerClass: TerrainHeightLayer };
	CONFIG.Canvas.layers.terrainHeightLosRulerLayer = { group: "interface", layerClass: LineOfSightRulerLayer };

	if (game.modules.get("lib-wrapper")?.active) initLibWrapper();

	Handlebars.registerHelper({
		add(...values) {
			values.pop();
			return values.reduce((a, b) => a + b);
		},
		multiply(...values) {
			values.pop();
			return values.reduce((a, b) => a * b);
		}
	});
}

function ready() {
	const terrainStackViewer = globalThis.terrainHeightTools.ui.terrainStackViewer = new TerrainStackViewer();
	terrainStackViewer.render(true);

	game.socket.on(socketName, handleSocketEvent);

	// Warn if lib-wrapper is missing (has to be done in ready not init, as user does not exist at init)
	if (game.user.isGM && game.modules.get("lib-wrapper")?.active !== true) {
		ui.notifications.error(game.i18n.localize("TERRAINHEIGHTTOOLS.MissingLibWrapperWarning"), { permanent: true });
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

function handleSocketEvent({ func, args }) {
	switch (func) {
		case socketFuncs.drawLineOfSightRay: {
			LineOfSightRulerLayer.current?._drawLineOfSightRays(...args);
			break;
		}

		case socketFuncs.clearLineOfSightRay: {
			LineOfSightRulerLayer.current?._clearLineOfSightRays(...args);
			break;
		}
	}
}
