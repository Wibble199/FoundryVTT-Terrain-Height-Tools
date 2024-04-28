import { moduleName, tools } from "../consts.mjs";

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
		onClick: () => {
			// TODO: Turn on/off the persistent layer
		},
		active: true,
		toggle: true
	});

	// Menu for editing the terrain
	controls.push({
		name: moduleName,
		title: game.i18n.localize("CONTROLS.GroupTerrainHeightTools"),
		icon: "fas fa-chart-simple",
		layer: "terrainHeightLayer",
		activeTool: tools.paint,
		visible: true, // TODO: permissions
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
				onClick: () => canvas.terrainHeightLayer?.clear(),
				button: true
			}
		]
	});
}
