import { LineOfSightRulerConfig } from '../applications/line-of-sight-ruler-config.mjs';
import { ShapeConversionConifg } from "../applications/shape-conversion-config.mjs";
import { TerrainErasePalette } from "../applications/terrain-erase-palette.mjs";
import { TerrainPaintPalette } from "../applications/terrain-paint-palette.mjs";
import { TerrainVisibilityConfig } from "../applications/terrain-visibility-config.mjs";
import { TokenLineOfSightConfig } from "../applications/token-line-of-sight-config.mjs";
import { moduleName, settings, tools } from "../consts.mjs";
import { LineOfSightRulerLayer } from "../layers/line-of-sight-ruler-layer.mjs";
import { TerrainHeightLayer } from "../layers/terrain-height-layer.mjs";
import { Signal } from "../utils/signal.mjs";

export const sceneControls = {
	/** @type {Signal<string>} */
	activeControl$: new Signal(),

	/** @type {Signal<string>} */
	activeTool$: new Signal(),

	/** @type {SceneControlTool | undefined} */
	terrainHeightToolsLayerToggleControlButton: undefined,

	/** @type {TerrainPaintPalette | undefined} */
	terrainPaintPalette: undefined,

	/** @type {TerrainErasePalette | undefined} */
	terrainErasePalette: undefined,

	/** @type {LineOfSightRulerConfig | undefined} */
	lineOfSightRulerConfig: undefined,

	/** @type {TokenLineOfSightConfig | undefined} */
	tokenLineOfSightConfig: undefined,

	/** @type {TerrainVisibilityConfig | undefined} */
	terrainVisibilityConfig: undefined,

	/** @type {ShapeConversionConifg | undefined} */
	shapeConversionConfig: undefined
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
				LineOfSightRulerLayer.current?._autoSelectTokenLosTargets();
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
		layer: "terrainHeightLayer",
		activeTool: tools.paint,
		visible: game.user.isGM,
		tools: [
			{
				name: tools.paint,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsPaint"),
				icon: "fas fa-paintbrush"
			},
			{
				name: tools.erase,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsErase"),
				icon: "fas fa-eraser"
			},
			{
				name: tools.eraseShape,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsEraseShape"),
				icon: "tht-icon-erase-shape"
			},
			{
				name: tools.pipette,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsPipette"),
				icon: "fas fa-eye-dropper"
			},
			{
				name: tools.terrainVisibility,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsTerrainVisibility"),
				icon: "fas fa-eye-slash"
			},
			{
				name: tools.convert,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsShapeConvert"),
				icon: "fas fa-arrow-turn-right"
			},
			{
				name: "clear",
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsClear"),
				icon: "fas fa-trash",
				onClick: async () => {
					const shouldDelete = await foundry.applications.api.DialogV2.confirm({
						window: { title: "TERRAINHEIGHTTOOLS.ClearConfirmTitle" },
						content: `<p>${game.i18n.format("TERRAINHEIGHTTOOLS.ClearConfirmContent")}</p>`,
						rejectClose: false
					});

					if (shouldDelete) TerrainHeightLayer.current?.clear();
				},
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
		sceneControls.terrainPaintPalette,
		() => sceneControls.terrainPaintPalette = new TerrainPaintPalette());

	// Show the eraser config if the eraser tool is selected
	renderToolSpecificApplication(
		controls.activeControl === moduleName && controls.activeTool === tools.erase,
		sceneControls.terrainErasePalette,
		() => sceneControls.terrainErasePalette = new TerrainErasePalette());

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

	// Show the visibility config if the visibility tool is selected
	renderToolSpecificApplication(
		controls.activeControl === moduleName && controls.activeTool === tools.terrainVisibility,
		sceneControls.terrainVisibilityConfig,
		() => sceneControls.terrainVisibilityConfig = new TerrainVisibilityConfig());

	// Show the conversion config if the convert tool is selected
	renderToolSpecificApplication(
		controls.activeControl === moduleName && controls.activeTool === tools.convert,
		sceneControls.shapeConversionConfig,
		() => sceneControls.shapeConversionConfig = new ShapeConversionConifg());
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
			const left = ui.sidebar?.element[0].getBoundingClientRect()?.left;
			application.setPosition({
				top: 5,
				left: left - application.constructor.DEFAULT_OPTIONS.position.width - 7
			});
		});

	} else if (condition && !application.rendered) {
		// If we should show the palette, and it's constructed but not shown, show it
		application.render(true);
	}
}
