import { moduleName, settings, tools } from "../consts.mjs";

/**
 * Registers the scene menu controls.
 * @param {SceneControl[]} controls
 */
export function registerSceneControls(controls) {
	// Add a Toggle button in the token controls
	controls.find(grp => grp.name === "token").tools.push({
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
