/** @import { Signal } from "@preact/signals-core" */
import { signal } from "@preact/signals-core";
import { html, render } from "lit";
import { TerrainTypesConfig } from "../applications/terrain-types-config.mjs";
import { flags, moduleName, settingNames, terrainStackViewerDisplayModes, tokenRelativeHeights } from "../consts.mjs";
import { loadTerrainTypes } from "../stores/terrain-types.mjs";

export const showTerrainHeightOnTokenLayer$ = signal(false);
export const showTerrainStackViewerOnTokenLayer$ = signal(false);
/** @type {Signal<terrainStackViewerDisplayModes>} */
export const terrainStackViewerDisplayMode$ = signal("auto");
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

	registerSetting(settingNames.terrainLayerAboveTilesDefault, {
		name: "SETTINGS.TerrainHeightLayerRenderAboveTiles.Name",
		hint: "SETTINGS.TerrainHeightLayerRenderAboveTiles.Hint",
		scope: "world",
		type: Boolean,
		default: true,
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

	/* registerSetting(settingNames.tokenElevationChange, {
		name: "SETTINGS.TokenElevationChange.Name",
		hint: "SETTINGS.TokenElevationChange.Hint",
		scope: "world",
		type: Boolean,
		config: true,
		default: false
	}); */

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
		default: true
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
 * @param {HTMLElement} html
 */
export function addAboveTilesToSceneConfig(sceneConfig, element) {
	/** @type {boolean | null | undefined} */
	const currentValue = sceneConfig.document.getFlag(moduleName, flags.terrainLayerAboveTiles);

	render(html`
		<div class="form-group">
			<label>${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTiles")}</label>
			<select name=${`flags.${moduleName}.${flags.terrainLayerAboveTiles}`} data-dtype="JSON">
				<option value="null" ?selected=${currentValue === null || currentValue === undefined}>
					${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTilesChoice.UseGlobal")}
				</option>
				<option value="true" ?selected=${currentValue === true}>
					${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTilesChoice.AboveTiles")}
				</option>
				<option value="false" ?selected=${currentValue === false}>
					${game.i18n.localize("TERRAINHEIGHTTOOLS.SceneRenderAboveTilesChoice.BelowTiles")}
				</option>
			</select>
		</div>
	`, element.querySelector(".tab[data-tab='grid']"));
}

/**
 * When token config is rendered, add a checkbox to ignore automatic elevation changes.
 * @param {TokenConfig} tokenConfig
 * @param {HTMLElement} element
 */
export function addIgnoreAutoElevationToTokenConfig(tokenConfig, element) {
	// Don't show the checkbox if the token elevation change setting isn't active
	if (!game.settings.get(moduleName, settingNames.tokenElevationChange)) return;

	const currentValue = tokenConfig.token.getFlag(moduleName, flags.ignoreAutoElevation) ?? false;

	render(html`
		<div class="form-group">
			<label>${game.i18n.localize("TERRAINHEIGHTTOOLS.IgnoreAutoElevation.Name")}</label>
			<div class="form-fields">
				<input type="checkbox" name="flags.${moduleName}.${flags.ignoreAutoElevation}" ?checked=${currentValue} />
			</div>
			<p class="hint">${game.i18n.localize("TERRAINHEIGHTTOOLS.IgnoreAutoElevation.Hint")}</p>
		</div>
	`, element.querySelector('.tab[data-tab="identity"]'));
}
