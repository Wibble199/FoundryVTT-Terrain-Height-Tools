import * as api from "./api.mjs";
import { TerrainStackViewer } from "./applications/terrain-stack-viewer.mjs";
import { registerSceneControls, renderToolSpecificApplications, sceneControls } from "./config/controls.mjs";
import { registerKeybindings } from "./config/keybindings.mjs";
import { addAboveTilesToSceneConfig, registerSettings } from "./config/settings.mjs";
import { heightMapProviderId, moduleName, socketFuncs, socketName } from "./consts.mjs";
import { heightMap } from "./geometry/height-map.mjs";
import * as autoTokenElevation from "./hooks/token-elevation.mjs";
import { LineOfSightRulerLayer } from "./layers/line-of-sight-ruler-layer.mjs";
import { TerrainHeightEditorLayer } from "./layers/terrain-height-editor-layer.mjs";
import { TerrainHeightGraphicsLayer } from "./layers/terrain-height-graphics/terrain-height-graphics-layer.mjs";
import * as canvasStore from "./stores/canvas.mjs";
import { registerTerrainProvider } from "./stores/terrain-manager.mjs";
import { loadTerrainTypes } from "./stores/terrain-types.mjs";
import { log } from "./utils/log.mjs";

Hooks.once("init", init);
Hooks.once("ready", ready);
Hooks.on("getSceneControlButtons", registerSceneControls);
Hooks.on("renderSceneControls", renderToolSpecificApplications);
Hooks.on("renderSceneConfig", addAboveTilesToSceneConfig);
Hooks.on("refreshToken", token => LineOfSightRulerLayer.current?._onTokenRefresh(token)); // TODO: is this needed?

Hooks.on("updateScene", canvasStore.onUpdateScene);
Hooks.on("canvasReady", canvasStore.onCanvasReady);
Hooks.on("canvasTearDown", canvasStore.onCanvasTearDown);

Hooks.on("preCreateToken", autoTokenElevation.handleTokenPreCreation);
Hooks.on("preUpdateToken", autoTokenElevation.handleTokenElevationChange);

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
	loadTerrainTypes();

	registerKeybindings();

	registerTerrainProvider(heightMapProviderId, heightMap);

	CONFIG.Canvas.layers.terrainHeightLayer = { group: "interface", layerClass: TerrainHeightEditorLayer };
	CONFIG.Canvas.layers.terrainHeightGraphicsLayer = { group: "interface", layerClass: TerrainHeightGraphicsLayer };
	CONFIG.Canvas.layers.terrainHeightLosRulerLayer = { group: "interface", layerClass: LineOfSightRulerLayer };

	if (game.modules.get("lib-wrapper")?.active) initLibWrapper();
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
		if (layer instanceof TerrainHeightEditorLayer && layer.canUndo) {
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
		if (sceneControls.tokenLineOfSightConfig?._isSelectingToken$.value) {
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
			LineOfSightRulerLayer.current?._updateTokenLineOfSightRays(...args);
			break;
		}

		case socketFuncs.clearLineOfSightRay: {
			LineOfSightRulerLayer.current?._clearLineOfSightRays(...args);
			break;
		}
	}
}
