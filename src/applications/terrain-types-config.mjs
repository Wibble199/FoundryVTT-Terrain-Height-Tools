/** @import { Signal } from "@preact/signals-core" */
/** @import { TerrainType } from "../stores/terrain-types.mjs" */
import { html } from "@lit-labs/preact-signals";
import { computed, signal } from "@preact/signals-core";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { when } from "lit/directives/when.js";
import { moduleName, settingNames } from "../consts.mjs";
import { LINE_TYPES } from "../shared/consts.mjs";
import { selectOptions } from "../shared/directives/select-options.mjs";
import "../shared/elements/color-animation-editor/color-animation-editor.mjs";
import { ContextMenu } from "../shared/elements/context-menu/context-menu.mjs";
import { createDefaultTerrainType, previewTerrainTypes$, terrainTypes$ } from "../stores/terrain-types.mjs";
import { abortableSubscribe } from "../utils/signal-utils.mjs";
import { colorPicker } from "./directives/color-picker.mjs";
import { rangePicker } from "./directives/range-picker.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { TerrainTypesPreset } from "./terrain-types-presets.mjs";

/** @typedef {(context: { app: TerrainTypesConfig; terrainType: TerrainType; index: number; }) => string | HTMLElement | import("lit").TemplateResult} UiPartRenderer */

const { ApplicationV2, DialogV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TerrainTypesConfig extends LitApplicationMixin(ApplicationV2) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainTypesConfig",
		tag: "form",
		classes: ["sheet"],
		window: {
			title: "SETTINGS.TerrainTypes.Button",
			contentClasses: ["standard-form"],
			resizable: true
		},
		position: {
			width: 820,
			height: 720
		},
		form: {
			handler: this.#onFormSubmit,
			submitOnChange: true,
			closeOnSubmit: false
		}
	};

	/** @type {Signal<TerrainType[]>} */
	#terrainTypes = signal([...terrainTypes$.value]);

	/** @type {Signal<string | undefined>} */
	#selectedTerrainTypeId = signal(terrainTypes$.value[0]?.id);

	#selectedTab = signal("lines");

	/** @override */
	_renderHTML() {
		return html`
			<div class="terrain-type-list-container">
				<!-- List of terrain types -->
				<ul class="terrain-type-list">
					${repeat(this.#terrainTypes.value, terrainType => terrainType.id, (terrainType, terraianTypeIndex) => html`
						<li
							class=${computed(() => classMap({ active: terrainType.id === this.#selectedTerrainTypeId.value }))}
							@click=${() => this.#selectedTerrainTypeId.value = terrainType.id}
							@contextmenu=${e => this.#openContextMenu(terrainType.id, terraianTypeIndex, e)}
						>
							<span>${terrainType.name}</span>
							<button type="button" @click=${e => this.#openContextMenu(terrainType.id, terraianTypeIndex, e)}>
								<i class="fas fa-ellipsis-vertical m-0"></i>
							</button>
						</li>
					`)}
				</ul>

				<div class="terrain-type-list-vertical-separator"></div>

				<!-- Terrain type form -->
				<div class="terrain-type-edit-pane">
					${repeat(this.#terrainTypes.value, terrainType => terrainType.id, (terrainType, terrainTypeIndex) => html`
						<div
							class="standard-form"
							style=${computed(() => styleMap({ display: terrainType.id === this.#selectedTerrainTypeId.value ? "flex" : "none" }))}
							data-terrain-type-id=${terrainType.id}
						>
							<input type="hidden" name="${terrainTypeIndex}.id" value=${terrainType.id}>

							<div class="form-group">
								<label>${l("Name")}</label>
								<div class="form-fields">
									<input type="text" name="${terrainTypeIndex}.name" value=${terrainType.name} placeholder=${l("Name")}>
								</div>
							</div>

							<nav class="sheet-tabs tabs">
								${Object.entries(configTabs).map(([tabId, tab]) => html`
									<a
										class=${computed(() => classMap({ active: this.#selectedTab.value === tabId }))}
										@click=${() => this.#selectedTab.value = tabId}
										data-tab
									>
										<i class=${tab.icon}></i>
										<label>${l(tab.label)}</label>
									</a>
								`)}
							</nav>

							${Object.entries(configTabs).map(([tabId, tab]) => html`
								<div class=${computed(() => classMap({ tab: true, active: this.#selectedTab.value === tabId }))} data-tab>
									${tab.parts.map(part => {
										try {
											const result = part({ app: this, terrainType, index: terrainTypeIndex, html });
											return typeof result === "string" ? unsafeHTML(result) : result;
										} catch (err) {
											return html`<span>Failed to render part: ${err}</span>`;
										}
									})}
								</div>
							`)}
						</div>
					`)}
				</div>
			</div>

			<footer class="form-footer">
				<button type="button" @click=${() => this.#addTerrainType()}>
					<i class="fas fa-plus"></i>
					<label>${l("TERRAINHEIGHTTOOLS.AddTerrainType")}</label>
				</button>
				<button type="button" @click=${() => this.#showImportPresetsDialog()}>
					<i class="fas fa-palette"></i>
					<label>${l("TERRAINHEIGHTTOOLS.ImportTerrainTypesPreset")}</label>
				</button>
				<button type="button" @click=${() => this.#showImportTerrainTypeSettingsDialog()}>
					<i class="fas fa-upload"></i>
					<label>${l("TERRAINHEIGHTTOOLS.ImportTerrainTypes")}</label>
				</button>
				<button type="button" @click=${() => this.#showExportTerrainTypeSettingsDialog()}>
					<i class="fas fa-download"></i>
					<label>${l("TERRAINHEIGHTTOOLS.ExportTerrainTypes")}</label>
				</button>
				<button type="button" @click=${() => this.#saveTerrainTypes()}>
					<i class="fas fa-save"></i>
					<label>${l("Save Changes")}</label>
				</button>
			</footer>
		`;
	}

	_preFirstRender(options) {
		super._preFirstRender(options);

		// When user changes something, update the preview which will show on the scene
		abortableSubscribe(
			this.#terrainTypes,
			foundry.utils.debounce(t => previewTerrainTypes$.value = t, 500),
			this.closeSignal
		);
	}

	close(options) {
		previewTerrainTypes$.value = null;
		return super.close(options);
	}

	/**
	 * @param {string} terrainTypeId
	 * @param {number} terrainTypeIndex
	 * @param {Event} e
	 */
	#openContextMenu(terrainTypeId, terrainTypeIndex, e) {
		e.preventDefault();
		e.stopImmediatePropagation();

		const isFirst = terrainTypeIndex === 0;
		const isLast = terrainTypeIndex === this.#terrainTypes.value.length - 1;

		ContextMenu.open(e, [
			!isFirst && {
				label: l("TERRAINHEIGHTTOOLS.MoveToTop"),
				icon: "fas fa-arrow-up-to-line",
				onClick: () => this.#moveTerrainTypeTo(terrainTypeId, 0)
			},
			!isFirst && {
				label: l("TERRAINHEIGHTTOOLS.MoveUp"),
				icon: "fas fa-arrow-up",
				onClick: () => this.#moveTerrainType(terrainTypeId, -1)
			},
			!isLast && {
				label: l("TERRAINHEIGHTTOOLS.MoveDown"),
				icon: "fas fa-arrow-down",
				onClick: () => this.#moveTerrainType(terrainTypeId, 1)
			},
			!isLast && {
				label: l("TERRAINHEIGHTTOOLS.MoveToBottom"),
				icon: "fas fa-arrow-down-to-line",
				onClick: () => this.#moveTerrainTypeTo(terrainTypeId, this.#terrainTypes.value.length)
			},
			{
				label: l("Duplicate"),
				icon: "fas fa-copy",
				onClick: () => this.#duplicateTerrainType(terrainTypeId)
			},
			{
				label: l("Delete"),
				icon: "fas fa-trash",
				onClick: () => this.#deleteTerrainType(terrainTypeId)
			}
		]);
	}

	// ---- //
	// Tabs //
	// ---- //
	/** @type {UiPartRenderer} */
	static _renderLinesTab = ({ app, terrainType, index }) => html`
		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.LineType")}</label>
			<div class="form-fields">
				<select name="${index}.lineType" data-dtype="Number">
					${selectOptions(LINE_TYPES, {
						labelSelector: ([name]) => `TERRAINHEIGHTTOOLS.LineType${name.titleCase()}`,
						valueSelector: 1,
						selected: terrainType.lineType
					})}
				</select>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType === LINE_TYPES.NONE })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineWidth")} <span class="units">(${l("Pixels")})</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.lineWidth" value=${terrainType.lineWidth} min="0" step="1">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType !== LINE_TYPES.DASHED })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineDashSize")} / ${l("TERRAINHEIGHTTOOLS.LineGapSize")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.lineDashSize" value=${terrainType.lineDashSize} min="1" step="1">
				<input type="number" name="${index}.lineGapSize" value=${terrainType.lineGapSize} min="1" step="1">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType !== LINE_TYPES.DASHED })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineDashAnimation")} <span class="units">(px/s)</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.lineDashOffsetAnimation" value=${terrainType.lineDashOffsetAnimation} step="1">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType === LINE_TYPES.NONE || terrainType.lineColorAnimation })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.lineColor`, value: terrainType.lineColor })}
				<button
					type="button"
					data-tooltip=${l("TERRAINHEIGHTTOOLS.EnableAnimation")}
					@click=${() => app.#setTerrainTypeProperty(index, "lineColorAnimation", {
						duration: 2500,
						easingFunc: "linear",
						keyframes: [
							{ color: 0xFF0000, alpha: 0.8, position: 0 },
							{ color: 0x0000FF, alpha: 0.8, position: 0.5 },
							{ color: 0xFF0000, alpha: 0.8, position: 1 }
						]
					})}
				>
					<i class="fas fa-sparkles m-0"></i>
				</button>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType === LINE_TYPES.NONE || terrainType.lineColorAnimation })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.lineOpacity`, value: terrainType.lineOpacity, min: 0, max: 1, step: 0.05 })}
			</div>
		</div>

		${when(terrainType.lineType !== LINE_TYPES.NONE && terrainType.lineColorAnimation, () => html`
			<div class="form-group">
				<label>${l("TERRAINHEIGHTTOOLS.LineColor")}</label>
				<div class="form-fields">
					<color-animation-editor-fwl
						name=${`${index}.lineColorAnimation`}
						.value=${terrainType.lineColorAnimation}
					></color-animation-editor-fwl>
					<button
						type="button"
						class="btn-active-fwl"
						data-tooltip=${l("TERRAINHEIGHTTOOLS.DisableAnimation")}
						@click=${() => app.#setTerrainTypeProperty(index, "lineColorAnimation", null)}
					>
						<i class="fas fa-sparkles m-0"></i>
					</button>
				</div>
			</div>
		`)}

		<hr/>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.LineFadeDistance")} <span class="units">(%)</span></label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.lineFadeDistance`, value: terrainType.lineFadeDistance, min: 0, max: 0.5, step: 0.05 })}
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineFadeDistance === 0 })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineFadeColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.lineFadeColor`, value: terrainType.lineFadeColor })}
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineFadeDistance === 0 })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineFadeOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.lineFadeOpacity`, value: terrainType.lineFadeOpacity, min: 0, max: 1, step: 0.05 })}
			</div>
		</div>
	`;

	/** @type {UiPartRenderer} */
	static _renderFillTab = ({ app, terrainType, index }) => html`
		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.FillType")}</label>
			<div class="form-fields">
				<select name="${index}.fillType" data-dtype="Number">
					${selectOptions(CONST.DRAWING_FILL_TYPES, {
						labelSelector: ([name]) => `DRAWING.FillType${name.titleCase()}`,
						valueSelector: 1,
						selected: terrainType.fillType
					})}
				</select>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType === CONST.DRAWING_FILL_TYPES.NONE || terrainType.fillColorAnimation })}>
			<label>${l("TERRAINHEIGHTTOOLS.FillColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.fillColor`, value: terrainType.fillColor })}
				<button
					type="button"
					data-tooltip=${l("TERRAINHEIGHTTOOLS.EnableAnimation")}
					@click=${() => app.#setTerrainTypeProperty(index, "fillColorAnimation", {
						duration: 2500,
						easingFunc: "linear",
						keyframes: [
							{ color: 0xFF0000, alpha: 0.2, position: 0 },
							{ color: 0x0000FF, alpha: 0.2, position: 0.5 },
							{ color: 0xFF0000, alpha: 0.2, position: 1 }
						]
					})}
				>
					<i class="fas fa-sparkles m-0"></i>
				</button>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType === CONST.DRAWING_FILL_TYPES.NONE || terrainType.fillColorAnimation })}>
			<label>${l("TERRAINHEIGHTTOOLS.FillOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.fillOpacity`, value: terrainType.fillOpacity, min: 0, max: 1, step: 0.1 })}
			</div>
		</div>

		${when(terrainType.fillType !== CONST.DRAWING_FILL_TYPES.NONE && terrainType.fillColorAnimation, () => html`
			<div class="form-group">
				<label>${l("TERRAINHEIGHTTOOLS.FillColor")}</label>
				<div class="form-fields">
					<color-animation-editor-fwl
						name=${`${index}.fillColorAnimation`}
						.value=${terrainType.fillColorAnimation}
					></color-animation-editor-fwl>
					<button
						type="button"
						class="btn-active-fwl"
						data-tooltip=${l("TERRAINHEIGHTTOOLS.DisableAnimation")}
						@click=${() => app.#setTerrainTypeProperty(index, "fillColorAnimation", null)}
					>
						<i class="fas fa-sparkles m-0"></i>
					</button>
				</div>
			</div>
		`)}

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN })}>
			<label>${l("TERRAINHEIGHTTOOLS.FillTexture")}</label>
			<div class="form-fields">
				<file-picker name="${index}.fillTexture" type="image" value=${terrainType.fillTexture}></file-picker>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN })}>
			<label>${l("TERRAINHEIGHTTOOLS.TextureOffset")} <span class="units">(${l("Pixels")})</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.fillTextureOffset.x" value=${terrainType.fillTextureOffset.x} step="1" required placeholder="X">
				<input type="number" name="${index}.fillTextureOffset.y" value=${terrainType.fillTextureOffset.y} step="1" required placeholder="Y">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN })}>
			<label>${l("TERRAINHEIGHTTOOLS.TextureScale")} <span class="units">%</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.fillTextureScale.x" value=${terrainType.fillTextureScale.x} step="1" required placeholder="X">
				<input type="number" name="${index}.fillTextureScale.y" value=${terrainType.fillTextureScale.y} step="1" required placeholder="Y">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN })}>
			<label>${l("TERRAINHEIGHTTOOLS.TextureOffsetAnimation")} <span class="units">px/s</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.fillTextureOffsetAnimation.x" value=${terrainType.fillTextureOffsetAnimation.x} step="1" required placeholder="X">
				<input type="number" name="${index}.fillTextureOffsetAnimation.y" value=${terrainType.fillTextureOffsetAnimation.y} step="1" required placeholder="Y">
			</div>
		</div>
	`;

	/** @type {UiPartRenderer} */
	static _renderLabelTab = ({ app, terrainType, index }) => html`
		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.LabelFormat.Name")}</label>
			<div class="form-fields">
				<textarea class="autoresize" name="${index}.textFormat">${terrainType.textFormat}</textarea>
				<div class="form-field-hint-icon" data-tooltip=${this.#getLabelPlaceholderTooltipHtml()} data-tooltip-class="tht_terrainTypesConfig_label-placeholder-tooltip">
					<i class="fas fa-question-circle"></i>
				</div>
			</div>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.ElevatedLabelFormat.Name")}</label>
			<div class="form-fields">
				<textarea class="autoresize" name="${index}.elevatedTextFormat">${terrainType.elevatedTextFormat}</textarea>
				<div class="form-field-hint-icon" data-tooltip=${this.#getLabelPlaceholderTooltipHtml()} data-tooltip-class="tht_terrainTypesConfig_label-placeholder-tooltip">
					<i class="fas fa-question-circle"></i>
				</div>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.ElevatedLabelFormat.Hint")}</p>
		</div>

		<div class="form-group">
			<label>${l("DRAWING.FontFamily")}</label>
			<div class="form-fields">
				<select name="${index}.font">
					${selectOptions(FontConfig.getAvailableFontChoices(), { selected: terrainType.font })}
				</select>
			</div>
		</div>

		<div class="form-group">
			<label>${l("DRAWING.FontSize")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.textSize" value=${terrainType.textSize} min="0" step="1">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.textColorAnimation })}>
			<label>${l("TERRAINHEIGHTTOOLS.LabelColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.textColor`, value: terrainType.textColor })}
				<button
					type="button"
					data-tooltip=${l("TERRAINHEIGHTTOOLS.EnableAnimation")}
					@click=${() => app.#setTerrainTypeProperty(index, "textColorAnimation", {
						duration: 2500,
						easingFunc: "linear",
						keyframes: [
							{ color: 0x000000, alpha: 1, position: 0 },
							{ color: 0xFFFFFF, alpha: 1, position: 0.5 },
							{ color: 0x000000, alpha: 1, position: 1 }
						]
					})}
				>
					<i class="fas fa-sparkles m-0"></i>
				</button>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.textColorAnimation })}>
			<label>${l("TERRAINHEIGHTTOOLS.LabelOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.textOpacity`, value: terrainType.textOpacity, min: 0, max: 1, step: 0.1 })}
			</div>
		</div>

		${when(terrainType.textColorAnimation, () => html`
			<div class="form-group">
				<label>${l("TERRAINHEIGHTTOOLS.LabelColor")}</label>
				<div class="form-fields">
					<color-animation-editor-fwl
						name=${`${index}.textColorAnimation`}
						.value=${terrainType.textColorAnimation}
					></color-animation-editor-fwl>
					<button
						type="button"
						class="btn-active-fwl"
						data-tooltip=${l("TERRAINHEIGHTTOOLS.DisableAnimation")}
						@click=${() => app.#setTerrainTypeProperty(index, "textColorAnimation", null)}
					>
						<i class="fas fa-sparkles m-0"></i>
					</button>
				</div>
			</div>
		`)}

		<hr/>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.StrokeThickness")} <span class="units">(${l("Pixels")})</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.textStrokeThickness" value=${terrainType.textStrokeThickness} min="0" step="1">
			</div>
		</div>

		<div class="form-group">
			<label>${l("DRAWING.StrokeColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.textStrokeColor`, value: terrainType.textStrokeColor, placeholder: "Automatic" })}
			</div>
		</div>

		<hr/>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.ShadowAmount")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.textShadowAmount" value=${terrainType.textShadowAmount} min="0" step="1">
			</div>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.ShadowColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.textShadowColor`, value: terrainType.textShadowColor, placeholder: "Automatic" })}
			</div>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.ShadowOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.textShadowOpacity`, value: terrainType.textShadowOpacity, min: 0, max: 1, step: 0.1 })}
			</div>
		</div>

		<hr/>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.AllowLabelRotation.Name")}</label>
			<div class="form-fields">
				<input type="checkbox" name="${index}.textRotation" .checked=${terrainType.textRotation}>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.AllowLabelRotation.Hint")}</p>
		</div>
	`;

	/** @type {UiPartRenderer} */
	static _renderOtherTab = ({ terrainType, index }) => html`
		<div class="form-group">
			<label for="terrainType${index}_isZone">${l("TERRAINHEIGHTTOOLS.IsZone.Name")}</label>
			<div class="form-fields">
				<input id="terrainType${index}_isZone" type="checkbox" name="${index}.isZone" .checked=${!terrainType.usesHeight}>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.IsZone.Hint")}</p>
		</div>

		<div class="form-group">
			<label for="terrainType${index}_isAlwaysVisible">${l("TERRAINHEIGHTTOOLS.IsAlwaysVisible.Name")}</label>
			<div class="form-fields">
				<input id="terrainType${index}_isAlwaysVisible" type="checkbox" name="${index}.isAlwaysVisible" .checked=${terrainType.isAlwaysVisible}>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.IsAlwaysVisible.Hint")}</p>
		</div>

		<div class="form-group">
			<label for="terrainType${index}_isSolid">${l("TERRAINHEIGHTTOOLS.IsSolid.Name")}</label>
			<div class="form-fields">
				<input id="terrainType${index}_isSolid" type="checkbox" name="${index}.isSolid" .checked=${terrainType.isSolid}>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.IsSolid.Hint")}</p>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.DefaultHeight.Name")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.defaultHeight" value=${terrainType.defaultHeight ?? ""} step="1">
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.DefaultHeight.Hint")}</p>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.DefaultElevation.Name")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.defaultElevation" value=${terrainType.defaultElevation ?? ""} step="1">
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.DefaultElevation.Hint")}</p>
		</div>
	`;

	// -------- //
	// Handlers //
	// -------- //
	/**
	 * @this {TerrainTypesConfig}
	 * @param {FormDataExtended} formData
	 */
	static #onFormSubmit(_event, _form, formData) {
		this.#terrainTypes.value = this.#getTerrainTypesFromForm(formData);
		this.render();
	}

	/**
	 * @template {keyof TerrainType} K
	 * @param {number} index
	 * @param {K} key
	 * @param {TerrainType[K]} value
	 */
	#setTerrainTypeProperty(index, key, value) {
		this.#terrainTypes.value = this.#terrainTypes.value.with(index, {
			...this.#terrainTypes.value[index],
			[key]: value
		});
		this.render();
	}

	async #saveTerrainTypes() {
		const formData = new FormDataExtended(this.element);
		const terrainTypes = this.#getTerrainTypesFromForm(formData);
		await game.settings.set(moduleName, settingNames.terrainTypes, terrainTypes);
		await this.close();
	}

	#addTerrainType() {
		/** @type {TerrainType} */
		const newTerrainType = createDefaultTerrainType();
		this.#terrainTypes.value = [...this.#terrainTypes.value, newTerrainType];
		this.#selectedTerrainTypeId.value = newTerrainType.id;
		this.render();
	}

	/**
	 * @param {string} terrainTypeId
	 * @param {1 | -1} dir
	 */
	#moveTerrainType(terrainTypeId, dir) {
		const index = this.#terrainTypes.value.findIndex(t => t.id === terrainTypeId);

		// Cannot move if already at the start/end
		if ((dir > 0 && index >= this.#terrainTypes.value.length) || (dir < 0 && index <= 0)) return;

		const newTerrainTypes = [...this.#terrainTypes.value];
		const [terrainType] = newTerrainTypes.splice(index, 1);
		newTerrainTypes.splice(index + dir, 0, terrainType);
		this.#terrainTypes.value = newTerrainTypes;
		this.render();
	}

	/**
	 * @param {string} terrainTypeId
	 * @param {number} newIndex
	 */
	#moveTerrainTypeTo(terrainTypeId, newIndex) {
		const index = this.#terrainTypes.value.findIndex(t => t.id === terrainTypeId);

		const newTerrainTypes = [...this.#terrainTypes.value];
		const [terrainType] = newTerrainTypes.splice(index, 1);
		newTerrainTypes.splice(newIndex, 0, terrainType);
		this.#terrainTypes.value = newTerrainTypes;
		this.render();
	}

	/** @param {string} terrainTypeId */
	#duplicateTerrainType(terrainTypeId) {
		const existingTerrainType = this.#terrainTypes.value.find(t => t.id === terrainTypeId);
		const newTerrainType = {
			...existingTerrainType,
			id: foundry.utils.randomID(),
			name: existingTerrainType.name + " (2)"
		};
		this.#terrainTypes.value = [...this.#terrainTypes.value, newTerrainType];
		this.#selectedTerrainTypeId.value = newTerrainType.id;
		this.render();
	}

	/** @param {string} terrainTypeId */
	#deleteTerrainType(terrainTypeId) {
		this.#terrainTypes.value = this.#terrainTypes.value.filter(t => t.id !== terrainTypeId);
		this.render();
	}

	// ------------- //
	// Import/export //
	// ------------- //
	async #showImportPresetsDialog() {
		// Ask user to select a preset
		try {
			const { data, replace } = await TerrainTypesPreset.show();
			this._importTerrainTypeSettings(data, replace);
		} catch {
			return; // User cancelled
		}
	}

	#showImportTerrainTypeSettingsDialog() {
		new DialogV2({
			id: "tht_terrainTypesImport",
			window: {
				title: l("TERRAINHEIGHTTOOLS.ImportTerrainTypes"),
				icon: "fas fa-upload",
				resizable: true
			},
			content: `<textarea placeholder="${l("TERRAINHEIGHTTOOLS.ImportTextPlaceholder")}"></textarea>`,
			buttons: [
				{
					icon: "<i class='fas fa-upload'></i>",
					label: l("TERRAINHEIGHTTOOLS.ImportCombine"),
					action: "importCombine",
					callback: (_event, _target, element) => {
						if (!this._importTerrainTypeSettings(element.querySelector("textarea").value, false))
							throw new Error("Invalid data"); // Throw as an error to prevent dialog from closing
					}
				},
				{
					icon: "<i class='fas fa-upload'></i>",
					label: l("TERRAINHEIGHTTOOLS.ImportReplace"),
					action: "importReplace",
					callback: (_event, _target, element) => {
						if (!this._importTerrainTypeSettings(element.querySelector("textarea").value, true))
							throw new Error("Invalid data"); // Throw as an error to prevent dialog from closing
					}
				},
				{
					icon: "<i class='fas fa-times'></i>",
					label: l("Close"),
					action: "close"
				}
			],
			position: {
				width: 720,
				height: 350
			}
		}).render(true);
	}

	#showExportTerrainTypeSettingsDialog() {
		new DialogV2({
			id: "tht_terrainTypesExport",
			window: {
				title: l("TERRAINHEIGHTTOOLS.ExportTerrainTypes"),
				icon: "fas fa-download",
				contentClasses: ["terrain-height-tool-window"],
				resizable: true
			},
			content: `<textarea readonly>${JSON.stringify(this.#terrainTypes)}</textarea>`,
			buttons: [
				{
					icon: "<i class='fas fa-check'></i>",
					label: l("Close"),
					action: "close"
				}
			],
			position: {
				width: 720,
				height: 350
			}
		}).render(true);
	}

	/**
	 * @param {string | Partial<TerrainType>[]} data Data to import. Either a JSON string or an already-parsed array.
	 * @param {boolean} replace Whether or not to delete all existing terrain types on a successful import.
	 * @returns {boolean} Boolean indicating if the import was successful.
	 */
	_importTerrainTypeSettings(data, replace = false) {
		if (!data?.length) return;

		const parsed = Array.isArray(data) ? data : JSON.parse(data);

		if (!Array.isArray(parsed)) {
			ui.notifications.error("Failed to import terrain type data: Expected JSON to be an array.");
			return false;
		}

		const sanitisedData = [];
		const defaultTerrainType = createDefaultTerrainType();
		for (let i = 0; i < parsed.length; i++) {
			if (typeof parsed[i] !== "object") {
				ui.notifications.error(`Expected item at index ${i} to be an object, but found ${typeof parsed[i]}`);
				return false;
			}

			// If we're in combine mode (replace = false), then see if there is one already with the same ID
			const existing = replace
				? undefined
				: this.#terrainTypes.value.find(t => t.id === parsed[i].id);

			// Combine it with defaults,
			const sanitisedTerrainType = {
				...defaultTerrainType,
				...existing ?? {},
				...parsed[i]
			};

			// Check that property types match those declared in the defaultTerrainType
			for (const [key, value] of Object.entries(defaultTerrainType)) {
				if (value !== null && typeof sanitisedTerrainType[key] !== typeof value) {
					ui.notifications.error(`Expected property '${key}' of item at index ${i} to be of type ${typeof value}, but found ${typeof sanitisedTerrainType[key]}`);
					return false;
				}
			}

			sanitisedData.push(sanitisedTerrainType);
		}

		if (replace) {
			this.#terrainTypes.value = sanitisedData;
		} else {
			// If combining, remove any existing with the same ID as an imported one
			const newIds = sanitisedData.map(t => t.id);
			this.#terrainTypes.value = [
				...this.#terrainTypes.value.filter(t => !newIds.includes(t.id)),
				...sanitisedData
			];
		}

		this.render();
		return true;
	}

	// ---- //
	// Misc //
	// ---- //
	/**
	 * @param {FormDataExtended} formData
	 * @returns {TerrainType[]}
	 */
	#getTerrainTypesFromForm(formData) {
		/** @type {(TerrainType & { isZone: boolean; })[]} */
		const terrainTypes = Object.entries(foundry.utils.expandObject(formData.object))
			.sort((a, b) => a[0] - b[0])
			.map(([, value]) => value);

		// Since the "Uses height?" option was changed to "Is zone?" we need to invert the checkbox.
		// We don't create a new property for this because we don't want to mess with peoples' existing configs.
		for (const terrainType of terrainTypes) {
			terrainType.usesHeight = !terrainType.isZone;
			delete terrainType.isZone;
		}

		return terrainTypes;
	}

	static #getLabelPlaceholderTooltipHtml() {
		const placeholders = [
			["%h%", l("TERRAINHEIGHTTOOLS.Placeholders.Height")],
			["%e%", l("TERRAINHEIGHTTOOLS.Placeholders.Elevation")],
			["%t%", l("TERRAINHEIGHTTOOLS.Placeholders.Top")]
		];
		return `
			<p>${l("TERRAINHEIGHTTOOLS.Placeholders.PlaceholderHelpText")}</p>
			<table>
				<tbody>
					${placeholders.map(([key, description]) => `<tr>
						<th>${key}</th>
						<td>${description}</td>
					</tr>`).join("")}
				</tbody>
			</table>
		`;
	}
}

/** @type {Record<string, { label: string; icon: string; parts: UiPartRenderer[]; }>} */
const configTabs = {
	lines: {
		label: "TERRAINHEIGHTTOOLS.TabLine",
		icon: "fas fa-paint-brush",
		parts: [TerrainTypesConfig._renderLinesTab]
	},
	fill: {
		label: "TERRAINHEIGHTTOOLS.TabFill",
		icon: "fas fa-fill-drip",
		parts: [TerrainTypesConfig._renderFillTab]
	},
	label: {
		label: "TERRAINHEIGHTTOOLS.TabLabel",
		icon: "fas fa-font",
		parts: [TerrainTypesConfig._renderLabelTab]
	},
	other: {
		label: "TERRAINHEIGHTTOOLS.TabOther",
		icon: "fas fa-cogs",
		parts: [TerrainTypesConfig._renderOtherTab]
	}
};

/**
 * Adds a new terrain type configuration section to the terrain type config UI.
 * @param {string | { id: string; label: string; icon: string; }} tab ID of an existing tab or config for a new tab to add to.
 * @param {UiPartRenderer} part UI configuration part to add.
 */
export function registerCustomConfigUi(tab, part) {
	if (typeof tab === "string") {
		const tabObj = configTabs[tab];
		if (!tabObj) throw new Error(`Could not add custom UI: Tab '${tab}' does not exist.`);
		tabObj.parts.push(part);

	} else {
		const { id, label, icon } = tab;
		const tabObj = configTabs[id];
		if (tabObj) {
			tabObj.parts.push(part);
		} else {
			configTabs[id] = { label, icon, parts: [part] };
		}
	}
}
