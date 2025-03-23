import { TerrainTypesConfig } from "../applications/terrain-types-config.mjs";
import { flags, moduleName, settings, terrainStackViewerDisplayModes, tokenRelativeHeights } from "../consts.mjs";
import { TerrainHeightLayer } from "../layers/terrain-height-layer.mjs";
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
			sceneControls.terrainPaintPalette?.render(false);
			TerrainHeightLayer.current?._updateGraphics();
			globalThis.terrainHeightTools.ui.terrainStackViewer?.render();
		}
	});

	// Note that during the v11 -> v12 migration, I made the mistake of getting this setting backwards, so when this
	// value is TRUE that actually means that the terrain layer should be rendered BELOW the tiles.
	// The UI labels have been corrected so that users have the expected behaviour, but the name of the setting has not
	// been changed so that users do not have to re-do their settings.
	// Will fix if there are ever any more breaking changes (such as a v13 port).
	game.settings.register(moduleName, settings.terrainLayerAboveTilesDefault, {
		name: "SETTINGS.TerrainHeightLayerRenderAboveTiles.Name",
		hint: "SETTINGS.TerrainHeightLayerRenderAboveTiles.Hint",
		scope: "world",
		type: Boolean,
		default: false,
		config: true,
		onChange: () => {
			if (canvas?.ready)
				canvas.primary?.sortChildren();
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
		onChange: value => {
			TerrainHeightLayer.current._graphics.showOnTokenLayer$.value = value;
		}
	});

	game.settings.register(moduleName, settings.showTerrainStackViewerOnTokenLayer, {
		name: "SETTINGS.ShowTerrainStackViewerOnTokenLayer.Name",
		hint: "SETTINGS.ShowTerrainStackViewerOnTokenLayer.Hint",
		scope: "client",
		type: Boolean,
		config: true,
		default: false
	});

	game.settings.register(moduleName, settings.terrainStackViewerDisplayMode, {
		name: "SETTINGS.TerrainStackViewerDisplayMode.Name",
		hint: "SETTINGS.TerrainStackViewerDisplayMode.Hint",
		scope: "client",
		type: String,
		choices: terrainStackViewerDisplayModes,
		config: true,
		default: "auto"
	});

	game.settings.register(moduleName, settings.terrainHeightLayerVisibilityRadius, {
		name: "SETTINGS.TerrainHeightLayerVisibilityRadius.Name",
		hint: "SETTINGS.TerrainHeightLayerVisibilityRadius.Hint",
		scope: "client",
		type: Number,
		range: { min: 0, max: 40, step: 1 },
		config: true,
		default: 0,
		onChange: value => {
			TerrainHeightLayer.current._graphics.maskRadius$.value = value;
		}
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
		scope: "world",
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
		onChange: () => TerrainHeightLayer.current?._updateGraphics()
	});

	game.settings.register(moduleName, settings.smartLabelPlacement, {
		name: "SETTINGS.TerrainHeightLayerSmartLabelPlacement.Name",
		hint: "SETTINGS.TerrainHeightLayerSmartLabelPlacement.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: true,
		onChange: () => TerrainHeightLayer.current?._updateGraphics()
	});
}

/**
 * When scene config is rendered, add a setting for the scene-level tile render order option.
 * @param {SceneConfig} sceneConfig
 * @param {jQuery} html
 */
export function addAboveTilesToSceneConfig(sceneConfig, html) {
	// Note that during the v11 -> v12 migration, I made the mistake of getting this value backwards, so when this
	// value is TRUE that actually means that the terrain layer should be rendered BELOW the tiles.
	// The UI labels have been corrected so that users have the expected behaviour, but the name of the flag has not
	// been changed so that users do not have to re-do their settings.
	// Will fix if there are ever any more breaking changes (such as a v13 port).
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
				<option value="false" ${currentValue === false ? "selected" : ""}>
					${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTilesChoice.AboveTiles")}
				</option>
				<option value="true" ${currentValue === true ? "selected" : ""}>
					${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTilesChoice.BelowTiles")}
				</option>
			</select>
		</div>
	`);
}
