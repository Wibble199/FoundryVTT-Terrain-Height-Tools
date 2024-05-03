import { keybindings, moduleName, settings } from "../consts.mjs";
import { sceneControls } from "./controls.mjs";

export function registerKeybindings() {
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
