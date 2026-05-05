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
	Object.assign(controls.tokens.tools, {
		[tools.lineOfSight]: {
			name: tools.lineOfSight,
			title: "CONTROLS.TerrainHeightToolsLineOfSightRuler",
			icon: "fas fa-ruler-combined"
		},
		[tools.tokenLineOfSight]: {
			name: tools.tokenLineOfSight,
			title: "CONTROLS.TerrainHeightToolsTokenLineOfSight",
			icon: "fas fa-compass-drafting",
			onChange: () => {
				LineOfSightRulerLayer.current?._autoSelectTokenLosTargets();
			}
		},
		[terrainHeightLayerToggleButtonName]: {
			name: terrainHeightLayerToggleButtonName,
			title: "CONTROLS.TerrainHeightToolsLayerToggle",
			icon: "fas fa-chart-simple",
			onChange: (_event, isActive) => game.settings.set(moduleName, settingNames.showTerrainHeightOnTokenLayer, isActive),
			toggle: true,
			active: game.settings.get(moduleName, settingNames.showTerrainHeightOnTokenLayer)
		}
	});

	// Menu for editing the terrain
	controls[terrainHeightEditorControlName] = {
		name: terrainHeightEditorControlName,
		title: "CONTROLS.GroupTerrainHeightTools",
		icon: "fas fa-chart-simple",
		layer: "terrainHeightEditorLayer",
		activeTool: tools.paint,
		visible: game.user.isGM,
		onChange: (_event, isActive) => {
			if (isActive)
				canvas.terrainHeightEditorLayer?.activate();
		},
		tools: {
			[tools.paint]: {
				name: tools.paint,
				title: "CONTROLS.TerrainHeightToolsPaint",
				icon: "fas fa-paintbrush-alt"
			},
			[tools.fill]: {
				name: tools.fill,
				title: "CONTROLS.TerrainHeightToolsFill",
				icon: "fas fa-fill-drip"
			},
			[tools.erase]: {
				name: tools.erase,
				title: "CONTROLS.TerrainHeightToolsErase",
				icon: "fas fa-eraser"
			},
			[tools.eraseShape]: {
				name: tools.eraseShape,
				title: "CONTROLS.TerrainHeightToolsEraseShape",
				icon: "far fa-rectangle-xmark"
			},
			[tools.pipette]: {
				name: tools.pipette,
				title: "CONTROLS.TerrainHeightToolsPipette",
				icon: "fas fa-eye-dropper"
			},
			[tools.terrainVisibility]: {
				name: tools.terrainVisibility,
				title: "CONTROLS.TerrainHeightToolsTerrainVisibility",
				icon: "fas fa-eye-slash"
			},
			[tools.convert]: {
				name: tools.convert,
				title: "CONTROLS.TerrainHeightToolsShapeConvert",
				icon: "fas fa-arrow-turn-right"
			},
			clear: {
				name: "clear",
				title: "CONTROLS.TerrainHeightToolsClear",
				icon: "fas fa-trash",
				onChange: async () => {
					const shouldDelete = await foundry.applications.api.DialogV2.confirm({
						window: { title: "TERRAINHEIGHTTOOLS.ClearConfirmTitle" },
						content: `<p>${game.i18n.format("TERRAINHEIGHTTOOLS.ClearConfirmContent")}</p>`,
						rejectClose: false
					});

					if (shouldDelete) heightMap.clear();
				},
				button: true
			}
		}
	};
}

// When the 'show terrain height on token layer' setting changes, update the button's active state
showTerrainHeightOnTokenLayer$.subscribe(isActive => {
	const toggleButton = ui.controls?.controls.tokens.tools[terrainHeightLayerToggleButtonName];

	if (toggleButton) {
		toggleButton.active = isActive;
		ui.controls.render();
	}
});

effect(() => {
	// When the LoS ruler is the active tool, show the LoS ruler config application
	if (activeControl$.value === "tokens" && activeTool$.value === tools.lineOfSight)
		(LineOfSightRulerConfig.current ??= new LineOfSightRulerConfig()).render(true);
	else
		LineOfSightRulerConfig.current?.close({ animate: false });

	// When token LoS is the active tool, show the toklen LoS config application
	if (activeControl$.value === "tokens" && activeTool$.value === tools.tokenLineOfSight)
		(TokenLineOfSightConfig.current ??= new TokenLineOfSightConfig()).render(true);
	else
		TokenLineOfSightConfig.current?.close({ animate: false });
});
