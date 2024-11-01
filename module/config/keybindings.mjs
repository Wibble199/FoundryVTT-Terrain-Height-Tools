import { keybindings, moduleName, settings } from "../consts.mjs";
import { sceneControls } from "./controls.mjs";

export function registerKeybindings() {
	game.keybindings.register(moduleName, keybindings.increaseLosRulerHeight, {
		name: "KEYBINDINGS.IncreaseLosRulerHeight",
		editable: [{ key: "Equal" }],
		onDown: () => {
			/** @type {import("../layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer} */
			const ruler = canvas.terrainHeightLosRulerLayer;
			ruler._handleHeightChangeKeybinding(1);
		}
	});

	game.keybindings.register(moduleName, keybindings.decreaseLosRulerHeight, {
		name: "KEYBINDINGS.DecreaseLosRulerHeight",
		editable: [{ key: "Minus" }],
		onDown: () => {
			/** @type {import("../layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer} */
			const ruler = canvas.terrainHeightLosRulerLayer;
			ruler._handleHeightChangeKeybinding(-1);
		}
	});

	game.keybindings.register(moduleName, keybindings.showTerrainStack, {
		name: "KEYBINDINGS.ShowTerrainStackViewer",
		editable: [{ key: "KeyQ" }],
		onDown: () => terrainHeightTools.ui.terrainStackViewer._keybindPressed$.value = true,
		onUp: () => terrainHeightTools.ui.terrainStackViewer._keybindPressed$.value = false,
	})

	game.keybindings.register(moduleName, keybindings.toggleTerrainHeightMapOnTokenLayer, {
		name: "KEYBINDINGS.ToggleTerrainHeightMapOnTokenLayer",
		onDown: () => {
			const isActive = !game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer);

			// Update setting (which will trigger the layer update)
			game.settings.set(moduleName, settings.showTerrainHeightOnTokenLayer, isActive);

			// Update the controls UI status
			if (ui.controls) {
				sceneControls.terrainHeightToolsLayerToggleControlButton.active = isActive;
				ui.controls.render();
			}
		}
	});
}
