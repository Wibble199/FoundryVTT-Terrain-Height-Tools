import { TerrainHeightPalette } from "../applications/terrain-height-palette.mjs";
import { moduleName, settings, tools } from "../consts.mjs";

export const sceneControls = {
	/** @type {SceneControlTool | undefined} */
	terrainHeightToolsLayerToggleControlButton: undefined,

	/** @type {TerrainHeightPalette | undefined} */
	terrainHeightPalette: undefined
};

/**
 * Registers the scene menu controls.
 * @param {SceneControl[]} controls
 */
export function registerSceneControls(controls) {
	// Don't show the controls on gridless scenes as they are not supported
	if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return;

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
				name: tools.eraseFill,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsEraseFill"),
				icon: "fas fa-fill"
			},
			{
				name: "clear",
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsClear"),
				icon: "fas fa-trash",
				onClick: () => Dialog.confirm({
					title: game.i18n.localize("TERRAINHEIGHTTOOLS.ClearConfirmTitle"),
					content: `<p>${game.i18n.format("TERRAINHEIGHTTOOLS.ClearConfirmContent")}</p>`,
					yes: () => game.canvas.terrainHeightLayer?.clear()
				}),
				button: true
			}
		]
	});
}

/**
 * Renders the terrain/height palette when the paint/fill tool is selected.
 * @param {SceneControls} controls
 */
export function renderTerrainHeightPalette(controls) {
	// Show the palette if either the paint or fill tools are selected
	const shouldShow = controls.activeControl === moduleName && [tools.paint, tools.fill].includes(controls.activeTool);

	if (!shouldShow && sceneControls.terrainHeightPalette?.rendered) {
		// If we shouldn't show the palette, close it if it's already open
		sceneControls.terrainHeightPalette?.close();

	} else if (shouldShow && !sceneControls.terrainHeightPalette) {
		// If we should show the palette, but haven't constructed one yet, do so now
		sceneControls.terrainHeightPalette = new TerrainHeightPalette();
		sceneControls.terrainHeightPalette.render(true);

		// Only position it once so that if the user moves it, we keep it in the same place
		Hooks.once("renderTerrainHeightPalette", () => {
			const { left } = $('#ui-right').position();
			sceneControls.terrainHeightPalette.setPosition({
				top: 5,
				left: left - TerrainHeightPalette.defaultOptions.width - 15
			});
		});

	} else if (shouldShow && !sceneControls.terrainHeightPalette.rendered) {
		// If we should show the palette, and it's constructed but not shown, show it
		sceneControls.terrainHeightPalette.render(true);
	}
}
