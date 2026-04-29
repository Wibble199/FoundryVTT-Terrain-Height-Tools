import { effect } from "@preact/signals-core";
import { LineOfSightRulerConfig } from "../applications/line-of-sight-ruler-config.mjs";
import { TokenLineOfSightConfig } from "../applications/token-line-of-sight-config.mjs";
import { moduleName, settingNames, terrainHeightEditorControlName, tools } from "../consts.mjs";
import { heightMap } from "../geometry/height-map.mjs";
import { LineOfSightRulerLayer } from "../layers/line-of-sight-ruler-layer.mjs";
import { activeControl$, activeTool$ } from "../stores/scene-controls.mjs";
import { showTerrainHeightOnTokenLayer$ } from "./settings.mjs";

const terrainHeightLayerToggleButtonName = "terrainHeightLayerToggle";

/**
 * Registers the scene menu controls.
 * @param {SceneControl[]} controls
 */
export function registerSceneControls(controls) {
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
		{
			name: terrainHeightLayerToggleButtonName,
			title: game.i18n.localize("CONTROLS.TerrainHeightToolsLayerToggle"),
			icon: "fas fa-chart-simple",
			onClick: isActive => game.settings.set(moduleName, settingNames.showTerrainHeightOnTokenLayer, isActive),
			toggle: true,
			active: game.settings.get(moduleName, settingNames.showTerrainHeightOnTokenLayer)
		}
	);

	// Menu for editing the terrain
	controls.push({
		name: terrainHeightEditorControlName,
		title: game.i18n.localize("CONTROLS.GroupTerrainHeightTools"),
		icon: "fas fa-chart-simple",
		layer: "terrainHeightEditorLayer",
		activeTool: tools.paint,
		visible: game.user.isGM,
		tools: [
			{
				name: tools.paint,
				title: game.i18n.localize("CONTROLS.TerrainHeightToolsPaint"),
				icon: "fas fa-paintbrush-alt"
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

					if (shouldDelete) heightMap.clear();
				},
				button: true
			}
		]
	});
}

// When the 'show terrain height on token layer' setting changes, update the button's active state
showTerrainHeightOnTokenLayer$.subscribe(isActive => {
	const toggleButton = ui.controls
		?.controls?.find(x => x.name == "token")
		?.tools.find(x => x.name == terrainHeightLayerToggleButtonName);

	if (toggleButton) {
		toggleButton.active = isActive;
		ui.controls.render();
	}
});

effect(() => {
	// When the LoS ruler is the active tool, show the LoS ruler config application
	if (activeControl$.value === "token" && activeTool$.value === tools.lineOfSight)
		(LineOfSightRulerConfig.current ??= new LineOfSightRulerConfig()).render(true);
	else
		LineOfSightRulerConfig.current?.close({ animate: false });

	// When token LoS is the active tool, show the toklen LoS config application
	if (activeControl$.value === "token" && activeTool$.value === tools.tokenLineOfSight)
		(TokenLineOfSightConfig.current ??= new TokenLineOfSightConfig()).render(true);
	else
		TokenLineOfSightConfig.current?.close({ animate: false });
});
