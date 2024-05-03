import { TerrainHeightPicker } from "../applications/terrain-height-picker.mjs";
import { moduleName, settings, tools } from "../consts.mjs";

export const sceneControls = {
	/** @type {SceneControlTool | undefined} */
	terrainHeightToolsLayerToggleControlButton: undefined,

	/** @type {TerrainHeightPicker | undefined} */
	terrainHeightPicker: undefined
};

/**
 * Registers the scene menu controls.
 * @param {SceneControl[]} controls
 */
export function registerSceneControls(controls) {
	// Add a Toggle button in the token controls
	controls.find(grp => grp.name === "token").tools.push(sceneControls.terrainHeightToolsLayerToggleControlButton = {
		name: "terrainHeightLayerToggle",
		title: game.i18n.localize("CONTROLS.TerrainHeightToolsLayerToggle"),
		icon: "fas fa-chart-simple",
		onClick: isActive => game.settings.set(moduleName, settings.showTerrainHeightOnTokenLayer, isActive),
		toggle: true,
		active: game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer)
	});

	// Menu for editing the terrain
	controls.push({
		name: moduleName,
		title: game.i18n.localize("CONTROLS.GroupTerrainHeightTools"),
		icon: "fas fa-chart-simple",
		layer: "terrainHeightLayer",
		activeTool: tools.paint,
		visible: game.user.can("UPDATE_SCENE"),
		tools: [
			{
				name: tools.paint,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsPaint"),
				icon: "fas fa-paintbrush"
			},
			{
				name: tools.fill,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsFill"),
				icon: "fas fa-fill-drip"
			},
			{
				name: tools.erase,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsErase"),
				icon: "fas fa-eraser"
			},
			{
				name: "clear",
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsClear"),
				icon: "fas fa-trash",
				onClick: () => game.canvas.terrainHeightLayer?.clear(),
				button: true
			}
		]
	});
}

/**
 * Renders the terrain/height picker when the paint/fill tool is selected.
 * @param {SceneControls} controls
 */
export function renderTerrainHeightPicker(controls) {
	// Show the picker if either the paint or fill tools are selected
	const shouldShow = controls.activeControl === moduleName && [tools.paint, tools.fill].includes(controls.activeTool);

	if (!shouldShow && sceneControls.terrainHeightPicker?.rendered) {
		// If we shouldn't show the picker, close it if it's already open
		sceneControls.terrainHeightPicker?.close();

	} else if (shouldShow && !sceneControls.terrainHeightPicker) {
		// If we should show the picker, but haven't constructed one yet, do so now
		sceneControls.terrainHeightPicker = new TerrainHeightPicker();
		sceneControls.terrainHeightPicker.render(true);

		// Only position it once so that if the user moves it, we keep it in the same place
		Hooks.once("renderTerrainHeightPicker", () => {
			const { left } = $('#ui-right').position();
			sceneControls.terrainHeightPicker.setPosition({
				top: 5,
				left: left - TerrainHeightPicker.defaultOptions.width - 15
			});
		});

	} else if (shouldShow && !sceneControls.terrainHeightPicker.rendered) {
		// If we should show the picker, and it's constructed but not shown, show it
		sceneControls.terrainHeightPicker.render(true);
	}
}
