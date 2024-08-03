import { LineOfSightRulerConfig } from '../applications/line-of-sight-ruler-config.mjs';
import { TerrainHeightPalette } from "../applications/terrain-height-palette.mjs";
import { TokenLineOfSightConfig } from "../applications/token-line-of-sight-config.mjs";
import { layers, moduleName, settings, tools } from "../consts.mjs";
import { Signal } from "../utils/reactive.mjs";

export const sceneControls = {
	/** @type {Signal<string>} */
	activeControl$: new Signal(),

	/** @type {Signal<string>} */
	activeTool$: new Signal(),

	/** @type {SceneControlTool | undefined} */
	terrainHeightToolsLayerToggleControlButton: undefined,

	/** @type {TerrainHeightPalette | undefined} */
	terrainHeightPalette: undefined,

	/** @type {LineOfSightRulerConfig | undefined} */
	lineOfSightRulerConfig: undefined,

	/** @type {TokenLineOfSightConfig | undefined} */
	tokenLineOfSightConfig: undefined
};

/**
 * Registers the scene menu controls.
 * @param {SceneControl[]} controls
 */
export function registerSceneControls(controls) {
	// Don't show the controls on gridless scenes as they are not supported
	if (canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS) return;

	// Add a LOS ruler and toggle map button in the token controls
	controls.find(grp => grp.name === "token").tools.push(
		{
			name: tools.lineOfSight,
			title: game.i18n.localize("CONTROLS.TerrainHeightToolsLineOfSightRuler"),
			icon: "fas fa-ruler-combined"
		},
		{
			name: tools.tokenLineOfSight,
			title: game.i18n.localize("CONTROLS.TerrainHeightToolsTokenLineOfSight"),
			icon: "fas fa-compass-drafting",
			onClick: () => {
				/** @type {import("../layers/line-of-sight-ruler-layer.mjs").LineOfSightRulerLayer} */
				const ruler = canvas[layers.lineOfSightRuler];
				ruler._autoSelectTokenLosTargets();
			}
		},
		sceneControls.terrainHeightToolsLayerToggleControlButton = {
			name: "terrainHeightLayerToggle",
			title: game.i18n.localize("CONTROLS.TerrainHeightToolsLayerToggle"),
			icon: "fas fa-chart-simple",
			onClick: isActive => game.settings.set(moduleName, settings.showTerrainHeightOnTokenLayer, isActive),
			toggle: true,
			active: game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer)
		}
	);

	// Menu for editing the terrain
	controls.push({
		name: moduleName,
		title: game.i18n.localize("CONTROLS.GroupTerrainHeightTools"),
		icon: "fas fa-chart-simple",
		layer: layers.heightMapEditor,
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
				name: tools.pipette,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsPipette"),
				icon: "fas fa-eye-dropper"
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
					yes: () => canvas.terrainHeightLayer?.clear()
				}),
				button: true
			}
		]
	});
}

/**
 * Renders certain applications when certain tools are selected:
 * - Terrain/height palette when the paint/fill tool is selected.
 * - Line of sight config when the line of sight ruler tool is selected.
 * @param {SceneControls} controls
 */
export function renderToolSpecificApplications(controls) {
	// Update the signals to allow notifying other parts of the module more easily
	sceneControls.activeControl$.value = controls.activeControl;
	sceneControls.activeTool$.value = controls.activeTool;

	// Show the palette if either the paint or fill tools are selected
	renderToolSpecificApplication(
		controls.activeControl === moduleName && [tools.paint, tools.fill].includes(controls.activeTool),
		sceneControls.terrainHeightPalette,
		() => sceneControls.terrainHeightPalette = new TerrainHeightPalette());

	// Show the line of sight ruler config if the line of sight ruler is selected
	renderToolSpecificApplication(
		controls.activeControl === "token" && controls.activeTool === tools.lineOfSight,
		sceneControls.lineOfSightRulerConfig,
		() => sceneControls.lineOfSightRulerConfig = new LineOfSightRulerConfig());

	// Show the token line of sight config if that tool is selected
	renderToolSpecificApplication(
		controls.activeControl === "token" && controls.activeTool === tools.tokenLineOfSight,
		sceneControls.tokenLineOfSightConfig,
		() => sceneControls.tokenLineOfSightConfig = new TokenLineOfSightConfig());
}

/**
 * @param {boolean} condition Whether or not to show the tool.
 * @param {Application} application Which application to render/update.
 * @param {() => Application} factory How to construct the application if it has not been created yet.
 */
function renderToolSpecificApplication(condition, application, factory) {
	if (!condition && application?.rendered) {
		// If we shouldn't show the palette, close it if it's already open
		application?.close();

	} else if (condition && !application) {
		// If we should show the palette, but haven't constructed one yet, do so now
		application = factory();
		application.render(true);

		// Only position it once so that if the user moves it, we keep it in the same place
		Hooks.once(`render${application.constructor.name}`, () => {
			const { left } = $('#ui-right').position();
			application.setPosition({
				top: 5,
				left: left - application.constructor.defaultOptions.width - 15
			});
		});

	} else if (condition && !application.rendered) {
		// If we should show the palette, and it's constructed but not shown, show it
		application.render(true);
	}
}
