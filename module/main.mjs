import * as api from './api.mjs';
import { registerSceneControls, renderToolSpecificApplications, sceneControls } from "./config/controls.mjs";
import { registerKeybindings } from "./config/keybindings.mjs";
import { addAboveTilesToSceneConfig, registerSettings } from './config/settings.mjs';
import { layers, moduleName, socketFuncs, socketName } from './consts.mjs';
import { HeightMap } from "./geometry/height-map.mjs";
import { terrainProviders$ } from "./geometry/terrain-providers.mjs";
import { HeightMapEditorLayer } from "./layers/height-map-editor-layer.mjs";
import { LineOfSightRulerLayer } from './layers/line-of-sight-ruler-layer.mjs';
import { TerrainHeightGraphics } from "./layers/terrain-height-graphics.mjs";
import { log } from "./utils/log.mjs";

Hooks.once("init", init);
Hooks.once("ready", ready);
Hooks.once("libWrapper.Ready", libWrapperReady);
Hooks.on("getSceneControlButtons", registerSceneControls);
Hooks.on("renderSceneControls", renderToolSpecificApplications);
Hooks.on("renderSceneConfig", addAboveTilesToSceneConfig);
Hooks.on("canvasInit", createHeightMap);
Hooks.on("canvasTearDown", destroyHeightMap);

Object.defineProperty(globalThis, "terrainHeightTools", {
	value: { ...api },
	writable: false
});

function init() {
	log("Initialising");

	registerSettings();

	registerKeybindings();

	CONFIG.Canvas.layers[layers.graphics] = { group: "primary", layerClass: TerrainHeightGraphics };
	CONFIG.Canvas.layers[layers.lineOfSightRuler] = { group: "interface", layerClass: LineOfSightRulerLayer };
	CONFIG.Canvas.layers[layers.heightMapEditor] = { group: "interface", layerClass: HeightMapEditorLayer };
}

function ready() {
	game.socket.on(socketName, handleSocketEvent);

	// Warn if lib-wrapper is missing (has to be done in ready not init, as user does not exist at init)
	if (game.user.isGM && game.modules.get("lib-wrapper")?.active !== true) {
		ui.notifications.error(game.i18n.localize("TERRAINHEIGHTTOOLS.MissingLibWrapperWarning"), { permanent: true });
	}
}

function libWrapperReady() {
	// Patch to allow the Undo keybinding to work for the Terrain Height Layer
	libWrapper.register(moduleName, "ClientKeybindings._onUndo", function(wrapped, ...args) {
		const layer = canvas.ready && canvas.activeLayer;
		if (layer instanceof HeightMapEditorLayer && layer.canUndo) {
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

	// Wrap the settings.set method to call a hook when the setting has been updated. There is a default Foundry hook
	// 'updateSetting', however this only fires on world-level setting changes, not on client-level settings changes.
	// This is used by THT to make the `Signal.fromSetting` observable work.
	libWrapper.register(moduleName, "ClientSettings.prototype.set", async function(wrapped, namespace, key, value, options) {
		value = await wrapped(namespace, key, value, options);
		Hooks.callAll("terrainHeightTools.updateSettings", namespace, key, value);
	}, libWrapper.WRAPPED);
}

/**
 * When a canvas is initialised, create and store the HeightMap for this canvas.
 * @param {Canvas} canvas
 */
function createHeightMap(canvas) {
	// Gridless scenes not supported
	if ((canvas?.grid?.type ?? 0) === CONST.GRID_TYPES.GRIDLESS) return;

	// Need to wait until the GridLayer has been draw, as this is what initialises the SquareGrid or HexagonalGrid that
	// is used to generate the HeightMap shapes
	Hooks.once("drawGridLayer", () => {
		HeightMap.current = new HeightMap(canvas.scene);
		terrainProviders$.add(HeightMap.current.shapes$);
	});
}

/**
 * When a canvas is torn down, remove the HeightMap for that canvas.
 */
function destroyHeightMap() {
	if (!HeightMap.current) return;

	terrainProviders$.delete(HeightMap.current.shapes$);
	HeightMap.current.destroy();
	HeightMap.current = undefined;
}

function handleSocketEvent({ func, args }) {
	switch (func) {
		case socketFuncs.drawLineOfSightRay: {
			/** @type {import("./layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer | undefined} */
			const losRulerLayer = canvas[layers.lineOfSightRuler];
			losRulerLayer?._drawLineOfSightRays(...args);
			break;
		}

		case socketFuncs.clearLineOfSightRay: {
			const losRulerLayer = canvas[layers.lineOfSightRuler];
			losRulerLayer?._clearLineOfSightRays(...args);
			break;
		}
	}
}
