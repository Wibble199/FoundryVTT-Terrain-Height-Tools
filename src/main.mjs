import * as api from "./api.mjs";
import { TerrainStackViewer } from "./applications/terrain-stack-viewer.mjs";
import { TokenLineOfSightConfig } from "./applications/token-line-of-sight-config.mjs";
import { registerSceneControls } from "./config/controls.mjs";
import { registerKeybindings } from "./config/keybindings.mjs";
import { addAboveTilesToSceneConfig, addIgnoreAutoElevationToTokenConfig, registerSettings } from "./config/settings.mjs";
import { heightMapProviderId, moduleName, socketFuncs, socketName, tools } from "./consts.mjs";
import { heightMap } from "./geometry/height-map.mjs";
import { LineOfSightRulerLayer } from "./layers/line-of-sight-ruler-layer.mjs";
import { TerrainHeightEditorLayer } from "./layers/terrain-height-editor/terrain-height-editor-layer.mjs";
import { TerrainHeightGraphicsLayer } from "./layers/terrain-height-graphics/terrain-height-graphics-layer.mjs";
import "./shared/style/shared.css";
import * as canvasStore from "./stores/canvas.mjs";
import { activeControl$, activeTool$, updateActiveControlTool } from "./stores/scene-controls.mjs";
import { registerTerrainProvider } from "./stores/terrain-manager.mjs";
import { loadTerrainTypes } from "./stores/terrain-types.mjs";
import "./styles/main.css";
import { log } from "./utils/log.mjs";

Hooks.once("init", init);
Hooks.once("ready", ready);

Object.defineProperty(globalThis, "terrainHeightTools", {
	value: {
		...api
	},
	writable: false
});

function init() {
	log("Initialising");

	registerSettings();
	loadTerrainTypes();

	Hooks.on("getSceneControlButtons", registerSceneControls);
	Hooks.on("activateSceneControls", updateActiveControlTool);
	Hooks.on("renderSceneConfig", addAboveTilesToSceneConfig);
	Hooks.on("renderTokenConfig", addIgnoreAutoElevationToTokenConfig);

	Hooks.on("updateScene", canvasStore.onUpdateScene);
	Hooks.on("canvasReady", canvasStore.onCanvasReady);
	Hooks.on("canvasTearDown", canvasStore.onCanvasTearDown);

	registerKeybindings();

	registerTerrainProvider(heightMapProviderId, heightMap);

	CONFIG.Canvas.layers.terrainHeightEditorLayer = { group: "interface", layerClass: TerrainHeightEditorLayer };
	CONFIG.Canvas.layers.terrainHeightGraphicsLayer = { group: "interface", layerClass: TerrainHeightGraphicsLayer };
	CONFIG.Canvas.layers.terrainHeightLosRulerLayer = { group: "interface", layerClass: LineOfSightRulerLayer };

	if (game.modules.get("lib-wrapper")?.active) initLibWrapper();
}

function ready() {
	new TerrainStackViewer().render(true);

	game.socket.on(socketName, handleSocketEvent);

	// Warn if lib-wrapper is missing (has to be done in ready not init, as user does not exist at init)
	if (game.user.isGM && game.modules.get("lib-wrapper")?.active !== true) {
		ui.notifications.error(game.i18n.localize("TERRAINHEIGHTTOOLS.MissingLibWrapperWarning"), { permanent: true });
	}
}

function initLibWrapper() {
	// Patches to allow clicking on a token to select it for the token line of sight
	// Since players are not allowed to click on tokens they do not own (in which case `_onClickLeft` does not even get
	// called) we also need to override the `can` method to allow players to click tokens they don't own when using the
	// token LoS tool.
	libWrapper.register(
		moduleName,
		"foundry.canvas.placeables.Token.prototype._onClickLeft",
		function(wrapped, ...args) {
			if (TokenLineOfSightConfig.current?._isSelectingToken$.value) {
				TokenLineOfSightConfig.current._onSelectToken(this);
				return;
			}
			wrapped(...args);
		},
		libWrapper.MIXED
	);

	libWrapper.register(
		moduleName,
		"foundry.canvas.interaction.MouseInteractionManager.prototype.can",
		function(wrapped, action, event) {
			if (action === "clickLeft" && TokenLineOfSightConfig.current?._isSelectingToken$.value)
				return true;
			return wrapped(action, event);
		},
		libWrapper.MIXED
	);

	// If the game is paused and a player (non-GM) tries to do a left click on the token layer, a warning message
	// appears telling them they can't do that while paused, so override _canDragLeftStart to prevent this message
	// appearing if the user is using the line of sight ruler or token line of sight tools.
	libWrapper.register(
		moduleName,
		"foundry.canvas.layers.TokenLayer.prototype._canDragLeftStart",
		function(wrapped, user, event) {
			if (activeControl$.value === "tokens" && [tools.tokenLineOfSight, tools.lineOfSight].includes(activeTool$.value))
				return false;
			return wrapped(user, event);
		},
		libWrapper.MIXED
	);
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
