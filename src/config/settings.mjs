/** @import { Signal } from "@preact/signals-core" */
import { signal } from "@preact/signals-core";
import { TerrainTypesConfig } from "../applications/terrain-types-config.mjs";
import { flags, moduleName, settingNames, terrainStackViewerDisplayModes, tokenRelativeHeights } from "../consts.mjs";
import { TerrainHeightEditorLayer } from "../layers/terrain-height-editor-layer.mjs";
import { loadTerrainTypes } from "../stores/terrain-types.mjs";

export const showTerrainHeightOnTokenLayer$ = signal(false);
export const showTerrainStackViewerOnTokenLayer$ = signal(false);
/** @type {Signal<terrainStackViewerDisplayModes>} */
export const terrainStackViewerDisplayMode$ = signal();
export const terrainHeightLayerVisibilityRadius$ = signal(0);
export const showZonesAboveNonZones$ = signal(false);
export const useFractionsForLabels$ = signal(true);
export const smartLabelPlacement$ = signal(true);
export const terrainLayerAboveTilesDefault$ = signal(true);

export function registerSettings() {

	game.settings.registerMenu(moduleName, settingNames.terrainTypes, {
		name: "SETTINGS.TerrainTypes.Name",
		label: "SETTINGS.TerrainTypes.Button",
		hint: "SETTINGS.TerrainTypes.Hint",
		icon: "fas fa-paintbrush",
		type: TerrainTypesConfig,
		restricted: true
	});

	registerSetting(settingNames.terrainTypes, {
		name: "SETTINGS.TerrainTypes.Name",
		scope: "world",
		default: [],
		type: Array,
		config: false,
		onChange: () => {
			loadTerrainTypes();
		}
	});

	// Note that during the v11 -> v12 migration, I made the mistake of getting this setting backwards, so when this
	// value is TRUE that actually means that the terrain layer should be rendered BELOW the tiles.
	// The UI labels have been corrected so that users have the expected behaviour, but the name of the setting has not
	// been changed so that users do not have to re-do their settings.
	// Will fix if there are ever any more breaking changes (such as a v13 port).
	registerSetting(settingNames.terrainLayerAboveTilesDefault, {
		name: "SETTINGS.TerrainHeightLayerRenderAboveTiles.Name",
		hint: "SETTINGS.TerrainHeightLayerRenderAboveTiles.Hint",
		scope: "world",
		type: Boolean,
		default: false,
		config: true
	}, terrainLayerAboveTilesDefault$);

	registerSetting(settingNames.displayLosMeasurementGm, {
		name: "SETTINGS.DisplayLosMeasurementGm.Name",
		hint: "SETTINGS.DisplayLosMeasurementGm.Hint",
		scope: "world",
		type: Boolean,
		default: true,
		config: true
	});

	registerSetting(settingNames.displayLosMeasurementPlayer, {
		name: "SETTINGS.DisplayLosMeasurementPlayer.Name",
		hint: "SETTINGS.DisplayLosMeasurementPlayer.Hint",
		scope: "world",
		type: Boolean,
		default: true,
		config: true
	});

	registerSetting(settingNames.defaultTokenLosTokenHeight, {
		name: "SETTINGS.DefaultTokenLosHeight.Name",
		hint: "SETTINGS.DefaultTokenLosHeight.Hint",
		scope: "world",
		type: Number,
		choices: tokenRelativeHeights,
		default: 1,
		config: true
	});

	registerSetting(settingNames.showTerrainHeightOnTokenLayer, {
		name: "SETTINGS.ShowTerrainHeightOnTokenLayer",
		scope: "client",
		type: Boolean,
		config: false,
		default: true
	}, showTerrainHeightOnTokenLayer$);

	registerSetting(settingNames.showTerrainStackViewerOnTokenLayer, {
		name: "SETTINGS.ShowTerrainStackViewerOnTokenLayer.Name",
		hint: "SETTINGS.ShowTerrainStackViewerOnTokenLayer.Hint",
		scope: "client",
		type: Boolean,
		config: true,
		default: false
	}, showTerrainStackViewerOnTokenLayer$);

	registerSetting(settingNames.terrainStackViewerDisplayMode, {
		name: "SETTINGS.TerrainStackViewerDisplayMode.Name",
		hint: "SETTINGS.TerrainStackViewerDisplayMode.Hint",
		scope: "client",
		type: String,
		choices: terrainStackViewerDisplayModes,
		config: true,
		default: "auto"
	}, terrainStackViewerDisplayMode$);

	registerSetting(settingNames.terrainHeightLayerVisibilityRadius, {
		name: "SETTINGS.TerrainHeightLayerVisibilityRadius.Name",
		hint: "SETTINGS.TerrainHeightLayerVisibilityRadius.Hint",
		scope: "client",
		type: Number,
		range: { min: 0, max: 40, step: 1 },
		config: true,
		default: 0
	}, terrainHeightLayerVisibilityRadius$);

	registerSetting(settingNames.otherUserLineOfSightRulerOpacity, {
		name: "SETTINGS.OtherUserLineOfSightRulerOpacity.Name",
		hint: "SETTINGS.OtherUserLineOfSightRulerOpacity.Hint",
		scope: "client",
		type: Number,
		range: { min: 0, max: 1, step: 0.05 },
		config: true,
		default: 0.5
	});

	registerSetting(settingNames.tokenLosToolPreselectToken1, {
		name: "SETTINGS.TokenLosToolPreselectToken1.Name",
		hint: "SETTINGS.TokenLosToolPreselectToken1.Hint",
		scope: "client",
		type: Boolean,
		config: true,
		default: true
	});

	registerSetting(settingNames.tokenLosToolPreselectToken2, {
		name: "SETTINGS.TokenLosToolPreselectToken2.Name",
		hint: "SETTINGS.TokenLosToolPreselectToken2.Hint",
		scope: "client",
		type: Boolean,
		config: true,
		default: true
	});

	registerSetting(settingNames.tokenElevationChange, {
		name: "SETTINGS.TokenElevationChange.Name",
		hint: "SETTINGS.TokenElevationChange.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: false
	});

	registerSetting(settingNames.showZonesAboveNonZones, {
		name: "SETTINGS.ShowZonesAboveNonZones.Name",
		hint: "SETTINGS.ShowZonesAboveNonZones.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: false
	}, showZonesAboveNonZones$);

	registerSetting(settingNames.useFractionsForLabels, {
		name: "SETTINGS.UseFractionsForLabels.Name",
		hint: "SETTINGS.UseFractionsForLabels.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: true,
		onChange: () => TerrainHeightEditorLayer.current?._updateGraphics()
	}, useFractionsForLabels$);

	registerSetting(settingNames.smartLabelPlacement, {
		name: "SETTINGS.TerrainHeightLayerSmartLabelPlacement.Name",
		hint: "SETTINGS.TerrainHeightLayerSmartLabelPlacement.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: true
	}, smartLabelPlacement$);

	/**
	 * Registers a setting and optionally binds it's value to a sigmal.
	 * @param {string} settingName
	 * @param {*} config
	 * @param {Signal<any>} signal
	*/
	function registerSetting(settingName, config, signal) {
		game.settings.register(moduleName, settingName, {
			...config,
			onChange: newValue => {
				config.onChange?.(newValue);
				if (signal) signal.value = newValue;
			}
		});

		if (signal) {
			signal.value = game.settings.get(moduleName, settingName);
		}
	}
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
