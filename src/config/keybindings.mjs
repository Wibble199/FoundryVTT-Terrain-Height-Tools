/** @import { Signal } from "@preact/signals-core" */
import { signal } from "@preact/signals-core";
import { keybindings, moduleName, settingNames } from "../consts.mjs";
import { LineOfSightRulerLayer } from "../layers/line-of-sight-ruler-layer.mjs";
import { sceneControls } from "./controls.mjs";

/** @type {Map<string, Set<(e: KeyboardEventContext) => void>>} */
const keybindingListeners = new Map();

/** @type {Record<keybindings, Signal<boolean>} */
export const keyPressedSignals = Object.fromEntries(
	Object.values(keybindings).map(k => [k, signal(false)])
);

export function registerKeybindings() {
	registerKeybinding(keybindings.increaseLosRulerHeight, {
		name: "KEYBINDINGS.IncreaseLosRulerHeight",
		editable: [{ key: "Equal" }],
		onDown: () => {
			LineOfSightRulerLayer.current?._handleHeightChangeKeybinding(1);
		}
	});

	registerKeybinding(keybindings.decreaseLosRulerHeight, {
		name: "KEYBINDINGS.DecreaseLosRulerHeight",
		editable: [{ key: "Minus" }],
		onDown: () => {
			LineOfSightRulerLayer.current?._handleHeightChangeKeybinding(-1);
		}
	});

	registerKeybinding(keybindings.showTerrainStack, {
		name: "KEYBINDINGS.ShowTerrainStackViewer",
		editable: [{ key: "KeyQ" }]
	});

	registerKeybinding(keybindings.toggleTerrainHeightMapOnTokenLayer, {
		name: "KEYBINDINGS.ToggleTerrainHeightMapOnTokenLayer",
		onDown: () => {
			const isActive = !game.settings.get(moduleName, settingNames.showTerrainHeightOnTokenLayer);

			// Update setting (which will trigger the layer update)
			game.settings.set(moduleName, settingNames.showTerrainHeightOnTokenLayer, isActive);

			// Update the controls UI status
			if (ui.controls) {
				sceneControls.terrainHeightToolsLayerToggleControlButton.active = isActive;
				ui.controls.render();
			}
		}
	});

	/**
	 * @param {keybindings} keybindingName
	 * @param {*} config
	 * @param {}
	 */
	function registerKeybinding(keybindingName, config) {
		game.keybindings.register(moduleName, keybindingName, {
			...config,
			onDown: e => {
				keyPressedSignals[keybindingName].value = true;
				keybindingListeners.get(keybindingName)?.forEach(handler => handler(e));
				config.onDown?.(e);
			},
			onUp: e => {
				keyPressedSignals[keybindingName].value = false;
				keybindingListeners.get(keybindingName)?.forEach(handler => handler(e));
				config.onUp?.(e);
			}
		});
	}
}

/**
 * @param {string} keybindingName
 * @param {(e: KeyboardEventContext) => void} fn
 */
export function addKeybindingListener(keybindingName, fn) {
	let handlers = keybindingListeners.get(keybindingName);
	if (!handlers) {
		handlers = new Set();
		keybindingListeners.set(keybindingName, handlers);
	}
	handlers.add(fn);
}

/**
 * @param {string} keybindingName
 * @param {(e: KeyboardEventContext) => void} fn
 */
export function removeKeybindingListener(keybindingName, fn) {
	keybindingListeners.get(keybindingName)?.delete(fn);
}
