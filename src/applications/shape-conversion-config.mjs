import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { when } from "lit/directives/when.js";
import { wallHeightModuleName } from "../consts.mjs";
import { convertConfig$, wallConfig$ } from "../stores/drawing.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtApplicationPositionMixin } from "./mixins/tht-application-position-mixin.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { WallDocument } = foundry.documents;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class ShapeConversionConfig extends ThtApplicationPositionMixin(LitApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_shapeConversionConfig",
		window: {
			title: "TERRAINHEIGHTTOOLS.ShapeConversionConfigTitle",
			icon: "fas fa-arrow-turn-right",
			contentClasses: ["terrain-height-tool-window"]
		},
		position: {
			width: 200
		}
	};

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_renderHTML() {
		return html`
			<p style="margin-top: 0; font-size: 0.95em;">${l("TERRAINHEIGHTTOOLS.ShapeConversionHint")}</p>

			<label class="flexrow align-items-center">
				<input
					type="checkbox"
					name="toDrawing"
					class="flex0"
					.checked=${convertConfig$.toDrawing}
					@input=${e => convertConfig$.toDrawing.value = e.target.checked}
				>
				<span>${l("TERRAINHEIGHTTOOLS.ConvertToDrawing")}</span>
			</label>

			<label class="flexrow align-items-center">
				<input
					type="checkbox"
					name="toRegion"
					class="flex0"
					.checked=${convertConfig$.toRegion}
					@input=${e => convertConfig$.toRegion.value = e.target.checked}
				>
				<span>${l("TERRAINHEIGHTTOOLS.ConvertToRegion")}</span>
			</label>

			<label class="flexrow align-items-center">
				<input
					type="checkbox"
					name="toWalls"
					class="flex0"
					.checked=${convertConfig$.toWalls}
					@input=${e => convertConfig$.toWalls.value = e.target.checked}
				>
				<span>${l("TERRAINHEIGHTTOOLS.ConvertToWalls")}</span>
				<button type="button" class="flex0" @click=${() => new WallConversionConfig().render(true)}>
					<i class="fas fa-cogs" style="margin-right: 0;"></i>
				</button>
			</label>

			${when(game.modules.get(wallHeightModuleName)?.active, () => html`
				<label class="flexrow align-items-center" style="padding-left: 1rem">
					<input
						type="checkbox"
						name="setWallHeightFlags"
						class="flex0"
						.checked=${convertConfig$.setWallHeightFlags}
						?disabled=${computed(() => !convertConfig$.toWalls.value)}
						@input=${e => convertConfig$.setWallHeightFlags.value = e.target.checked}
					>
					<span>${l("TERRAINHEIGHTTOOLS.SetWallHeightFlags")}</span>
				</label>
			`)}

			<label class="flexrow align-items-center">
				<input
					type="checkbox"
					name="deleteAfter"
					class="flex0"
					.checked=${convertConfig$.deleteAfter}
					@input=${e => convertConfig$.deleteAfter.value = e.target.checked}
				>
				<span>${l("TERRAINHEIGHTTOOLS.DeleteAfterConversion")}</span>
			</label>
		`;
	}
}

/**
 * Custom wall config window that updates the conversion config instead of a WallDocument.
 *
 * This is basically a clone of the base Foundry system one with a tweaked _prepareContext and _processSubmitData.
 */
class WallConversionConfig extends HandlebarsApplicationMixin(ApplicationV2) {

	constructor(options = {}) {
		super(undefined, options);
	}

	static DEFAULT_OPTIONS = {
		id: "tht_wallConversionConfig",
		classes: ["wall-config"],
		tag: "form",
		position: {
			width: 480
		},
		window: {
			contentClasses: ["standard-form"],
			icon: "fa-solid fa-block-brick"
		},
		form: {
			handler: this.#onSubmit,
			closeOnSubmit: true,
			submitOnChange: false
		},
		actions: {
			previewSound: WallConversionConfig.#onPreviewSound
		}
	};

	static PARTS = {
		body: {
			template: "templates/scene/wall-config.hbs"
		},
		footer: {
			template: "templates/generic/form-footer.hbs"
		}
	};

	static #PROXIMITY_SENSE_TYPES = [CONST.WALL_SENSE_TYPES.PROXIMITY, CONST.WALL_SENSE_TYPES.DISTANCE];

	#audioPreviewState = 0;

	// Nearly identical to WallConfig._prepareContext, but uses wallConfig$ instead of document.
	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		const { fields } = WallDocument.schema;

		const source = {
			_id: null,
			...wallConfig$.value,
			flags: {}
		};

		const thresholdFields = ["light", "sight", "sound"].map(k => ({
			name: k,
			label: fields[k].label,
			choices: fields[k].choices,
			disabled: !WallConversionConfig.#PROXIMITY_SENSE_TYPES.includes(source[k])
		}));

		const animationDirections = [
			{ value: -1, label: game.i18n.localize("WALL.ANIMATION_DIRECTIONS.REVERSE") },
			{ value: 1, label: game.i18n.localize("WALL.ANIMATION_DIRECTIONS.DEFAULT") }
		];
		return Object.assign(context, {
			fields,
			source,
			coordinates: "N/A",
			thresholdFields,
			animation: source.animation ?? fields.animation.clean({}),
			animationDirections,
			animationTypes: CONFIG.Wall.animationTypes,
			animationFieldsetClass: (source.door > 0) && source.animation?.type ? "" : "hidden",
			editingMany: false,
			rootId: foundry.utils.randomID(),
			gridUnits: canvas.scene.grid.units ?? game.i18n.localize("GridUnits"),
			doorSounds: CONFIG.Wall.doorSounds,
			buttons: [{ type: "submit", icon: "fa-solid fa-floppy-disk", label: "WALL.Submit" }]
		});
	}

	// Identical to WallConfig._onChangeForm
	_onChangeForm(_formConfig, event) {
		switch (event.target.name) {
			case "door":
				this.#toggleDoorOptions(Number(event.target.value) > CONST.WALL_DOOR_TYPES.NONE);
				this.#toggleAnimationOptions();
				break;
			case "doorSound":
				// Reset the audio preview state
				this.#audioPreviewState = 0;
				break;
			case "light":
			case "sight":
			case "sound":
				this.#toggleThresholdInputVisibility();
				break;
			case "animation.type":
				this.#toggleAnimationOptions();
		}
	}

	// Identical to WallConfig.#onPreviewSound
	/** @this {WallConversionConfig} */
	static async #onPreviewSound() {
		const doorSoundName = this.form["doorSound"].value;
		const doorSound = CONFIG.Wall.doorSounds[doorSoundName];
		if (!doorSound) return;
		const interactions = CONST.WALL_DOOR_INTERACTIONS;
		const interaction = interactions[this.#audioPreviewState++ % interactions.length];
		let sounds = doorSound[interaction];
		if (!sounds) return;
		if (!Array.isArray(sounds)) sounds = [sounds];
		const src = sounds[Math.floor(Math.random() * sounds.length)];
		await game.audio.play(src, { context: game.audio.interface });
	}

	// Identical to WallConfig.#toggleDoorOptions
	#toggleDoorOptions(isDoor) {
		for (const name of ["ds", "doorSound", "animation.type"]) {
			const select = this.form[name];
			select.disabled = !isDoor;
			select.closest(".form-group").hidden = !isDoor;
		}
		this.setPosition(); // Form height changed
	}

	// Identical to WallConfig.#toggleAnimationOptions
	#toggleAnimationOptions() {
		const showOptions = (Number(this.form.door.value) > 0) && !!this.form["animation.type"].value;
		const fieldset = this.element.querySelector("fieldset.door-animation");
		fieldset.classList.toggle("hidden", !showOptions);
		this.setPosition(); // Form height changed
	}

	// Identical to WallConfig.#toggleThresholdInputVisibility
	#toggleThresholdInputVisibility() {
		for (const sense of ["light", "sight", "sound"]) {
			const type = Number(this.form[sense].value);
			const input = this.form[`threshold.${sense}`];
			input.disabled = input.hidden = !WallConversionConfig.#PROXIMITY_SENSE_TYPES.includes(type);
		}
	}

	// Nearly identical to WallConfig._prepareSubmitData (with some functions from DocumentSheetV2 inlined)
	_prepareSubmitData(_event, _form, formData, updateData) {
		const submitData = foundry.utils.expandObject(formData.object);
		if (updateData) {
			foundry.utils.mergeObject(submitData, updateData, { performDeletions: true });
			foundry.utils.mergeObject(submitData, updateData, { performDeletions: false });
		}
		WallDocument.schema.validate({ changes: submitData, clean: true, fallback: false });

		const thresholds = submitData.threshold ??= {};
		for (const sense of ["light", "sight", "sound"]) {
			if (!WallConversionConfig.#PROXIMITY_SENSE_TYPES.includes(submitData[sense])) thresholds[sense] = null;
		}
		if (submitData.door === CONST.WALL_DOOR_TYPES.NONE) submitData.animation = null; // Purge animation data
		return submitData;
	}

	// Custom handler to write to wallConfig$ instead of a document.
	/** @this {WallConversionConfig} */
	static #onSubmit(event, form, formData, options = {}) {
		const submitData = this._prepareSubmitData(event, form, formData, options.updateData);
		wallConfig$.value = submitData;
	}
}
