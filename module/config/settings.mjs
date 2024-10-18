import { TerrainTypesConfig } from "../applications/terrain-types-config.mjs";
import { flags, moduleName, settings, tokenRelativeHeights } from "../consts.mjs";
import { sceneControls } from "./controls.mjs";

export function registerSettings() {

	game.settings.registerMenu(moduleName, settings.terrainTypes, {
		name: "SETTINGS.TerrainTypes.Name",
		label: "SETTINGS.TerrainTypes.Button",
		hint: "SETTINGS.TerrainTypes.Hint",
		icon: "fas fa-paintbrush",
		type: TerrainTypesConfig,
		restricted: true
	});

	game.settings.register(moduleName, settings.terrainTypes, {
		name: "SETTINGS.TerrainTypes.Name",
		scope: "world",
		default: [],
		type: Array,
		config: false,
		onChange: () => {
			sceneControls.terrainHeightPalette?.render(false);
			game.canvas.terrainHeightLayer._updateGraphics();
		}
	});

	game.settings.register(moduleName, settings.terrainLayerAboveTilesDefault, {
		name: "SETTINGS.TerrainHeightLayerRenderAboveTiles.Name",
		hint: "SETTINGS.TerrainHeightLayerRenderAboveTiles.Hint",
		scope: "world",
		type: Boolean,
		default: true,
		config: true,
		onChange: () => {
			if (game.canvas?.ready)
				game.canvas.primary?.sortChildren();
		}
	});

	game.settings.register(moduleName, settings.displayLosMeasurementGm, {
		name: "SETTINGS.DisplayLosMeasurementGm.Name",
		hint: "SETTINGS.DisplayLosMeasurementGm.Hint",
		scope: "world",
		type: Boolean,
		default: true,
		config: true
	});

	game.settings.register(moduleName, settings.displayLosMeasurementPlayer, {
		name: "SETTINGS.DisplayLosMeasurementPlayer.Name",
		hint: "SETTINGS.DisplayLosMeasurementPlayer.Hint",
		scope: "world",
		type: Boolean,
		default: true,
		config: true
	});

	game.settings.register(moduleName, settings.defaultTokenLosTokenHeight, {
		name: "SETTINGS.DefaultTokenLosHeight.Name",
		hint: "SETTINGS.DefaultTokenLosHeight.Hint",
		scope: "world",
		type: Number,
		choices: tokenRelativeHeights,
		default: 1,
		config: true
	});

	game.settings.register(moduleName, settings.showTerrainHeightOnTokenLayer, {
		name: "SETTINGS.ShowTerrainHeightOnTokenLayer",
		scope: "client",
		type: Boolean,
		config: false,
		default: true,
		onChange: value => game.canvas.terrainHeightLayer._graphics.setVisible(value)
	});

	game.settings.register(moduleName, settings.terrainHeightLayerVisibilityRadius, {
		name: "SETTINGS.TerrainHeightLayerVisibilityRadius.Name",
		hint: "SETTINGS.TerrainHeightLayerVisibilityRadius.Hint",
		scope: "client",
		type: Number,
		range: { min: 0, max: 40, step: 1 },
		config: true,
		default: 0,
		onChange: value => game.canvas.terrainHeightLayer._graphics._setMaskRadius(value)
	});

	game.settings.register(moduleName, settings.otherUserLineOfSightRulerOpacity, {
		name: "SETTINGS.OtherUserLineOfSightRulerOpacity.Name",
		hint: "SETTINGS.OtherUserLineOfSightRulerOpacity.Hint",
		scope: "client",
		type: Number,
		range: { min: 0, max: 1, step: 0.05 },
		config: true,
		default: 0.5
	});

	game.settings.register(moduleName, settings.tokenLosToolPreselectToken1, {
		name: "SETTINGS.TokenLosToolPreselectToken1.Name",
		hint: "SETTINGS.TokenLosToolPreselectToken1.Hint",
		scope: "client",
		type: Boolean,
		config: true,
		default: true
	});

	game.settings.register(moduleName, settings.tokenLosToolPreselectToken2, {
		name: "SETTINGS.TokenLosToolPreselectToken2.Name",
		hint: "SETTINGS.TokenLosToolPreselectToken2.Hint",
		scope: "client",
		type: Boolean,
		config: true,
		default: true
	});

	game.settings.register(moduleName, settings.tokenElevationChange, {
		name: "SETTINGS.TokenElevationChange.Name",
		hint: "SETTINGS.TokenElevationChange.Hint",
		scope: "client",
		type: Boolean,
		config: true,
		default: false
	});

	game.settings.register(moduleName, settings.useFractionsForLabels, {
		name: "SETTINGS.UseFractionsForLabels.Name",
		hint: "SETTINGS.UseFractionsForLabels.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: true,
		onChange: () => game.canvas.terrainHeightLayer._updateGraphics()
	});

	game.settings.register(moduleName, settings.deleteShapeAfterConvert, {
		name: "SETTINGS.DeleteTerrainShapeAfterConvert.Name",
		hint: "SETTINGS.DeleteTerrainShapeAfterConvert.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: false
	});

	game.settings.register(moduleName, settings.smartLabelPlacement, {
		name: "SETTINGS.TerrainHeightLayerSmartLabelPlacement.Name",
		hint: "SETTINGS.TerrainHeightLayerSmartLabelPlacement.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: true,
		onChange: () => game.canvas.terrainHeightLayer._updateGraphics()
	});
}

/**
 * When scene config is rendered, add a setting for the scene-level tile render order option.
 * @param {SceneConfig} sceneConfig
 * @param {jQuery} html
 */
export function addAboveTilesToSceneConfig(sceneConfig, html) {
	/** @type {boolean | null | undefined} */
	const currentValue = sceneConfig.object.getFlag(moduleName, flags.terrainLayerAboveTiles);

	html.find(".tab[data-tab='grid']").append(`
		<hr/>
		<div class="form-group">
			<label>${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTiles")}</label>
			<select name="flags.${moduleName}.${flags.terrainLayerAboveTiles}" data-dtype="JSON">
				<option value="null" ${currentValue === null || currentValue === undefined ? "selected" : ""}>
					${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTilesChoice.UseGlobal")}
				</option>
				<option value="true" ${currentValue === true ? "selected" : ""}>
					${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTilesChoice.AboveTiles")}
				</option>
				<option value="false" ${currentValue === false ? "selected" : ""}>
					${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTilesChoice.BelowTiles")}
				</option>
			</select>
		</div>
	`);
}
