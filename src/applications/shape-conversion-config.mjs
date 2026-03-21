import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { when } from "lit/directives/when.js";
import { wallHeightModuleName } from "../consts.mjs";
import { convertConfig$ } from "../stores/drawing.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtApplicationPositionMixin } from "./mixins/tht-application-position-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

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
 */
class WallConversionConfig extends FormApplication {

	#audioPreviewState = 0;

	constructor(options = {}) {
		super(undefined, options);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "tht_wallConversionConfig",
			title: game.i18n.localize("DOCUMENT.Wall"),
			classes: ["sheet", "wall-config"],
			template: "templates/scene/wall-config.html",
			width: 400,
			height: "auto"
		});
	}

	/** @override */
	getData(options = {}) {
		// This needs to match the data that is provided to the base system's wall config dialog.

		const context = super.getData(options);

		// Populate from the THT config
		context.source = {
			_id: null,
			c: [0, 0, 1, 1],
			...convertConfig$.wallConfig.value,
			flags: {}
		};
		context.p0 = { x: 0, y: 0 };
		context.p1 = { x: 1, y: 1 };

		context.gridUnits = game.i18n.localize("GridUnits");

		// Copied from the normal WallConfig
		context.moveTypes = Object.keys(CONST.WALL_MOVEMENT_TYPES).reduce((obj, key) => {
			const k = CONST.WALL_MOVEMENT_TYPES[key];
			obj[k] = game.i18n.localize(`WALLS.SenseTypes.${key}`);
			return obj;
		}, {});
		context.senseTypes = Object.keys(CONST.WALL_SENSE_TYPES).reduce((obj, key) => {
			const k = CONST.WALL_SENSE_TYPES[key];
			obj[k] = game.i18n.localize(`WALLS.SenseTypes.${key}`);
			return obj;
		}, {});
		context.dirTypes = Object.keys(CONST.WALL_DIRECTIONS).reduce((obj, key) => {
			const k = CONST.WALL_DIRECTIONS[key];
			obj[k] = game.i18n.localize(`WALLS.Directions.${key}`);
			return obj;
		}, {});
		context.doorTypes = Object.keys(CONST.WALL_DOOR_TYPES).reduce((obj, key) => {
			const k = CONST.WALL_DOOR_TYPES[key];
			obj[k] = game.i18n.localize(`WALLS.DoorTypes.${key}`);
			return obj;
		}, {});
		context.doorStates = Object.keys(CONST.WALL_DOOR_STATES).reduce((obj, key) => {
			const k = CONST.WALL_DOOR_STATES[key];
			obj[k] = game.i18n.localize(`WALLS.DoorStates.${key}`);
			return obj;
		}, {});
		context.doorSounds = CONFIG.Wall.doorSounds;
		context.isDoor = undefined;
		return context;
	}

	/** @override */
	_updateObject(_event, formData) {
		const newWallConfig = foundry.utils.expandObject(formData);
		delete newWallConfig.flags;
		convertConfig$.wallConfig.value = newWallConfig;
	}

	activateListeners(html) {
		html.find(".audio-preview").click(this.#onAudioPreview.bind(this));
		this.#enableDoorOptions(convertConfig$.wallConfig.door.value > CONST.WALL_DOOR_TYPES.NONE);
		this.#toggleThresholdInputVisibility();
		return super.activateListeners(html);
	}

	// Copied from WallConfig //

	async _onChangeInput(event) {
		if (event.currentTarget.name === "door") {
			this.#enableDoorOptions(Number(event.currentTarget.value) > CONST.WALL_DOOR_TYPES.NONE);
		} else if (event.currentTarget.name === "doorSound") {
			this.#audioPreviewState = 0;
		} else if (["light", "sight", "sound"].includes(event.currentTarget.name)) {
			this.#toggleThresholdInputVisibility();
		}
		return super._onChangeInput(event);
	}

	#onAudioPreview() {
		const doorSoundName = this.form.doorSound.value;
		const doorSound = CONFIG.Wall.doorSounds[doorSoundName];
		if (!doorSound) return;
		const interactions = CONST.WALL_DOOR_INTERACTIONS;
		const interaction = interactions[this.#audioPreviewState++ % interactions.length];
		let sounds = doorSound[interaction];
		if (!sounds) return;
		if (!Array.isArray(sounds)) sounds = [sounds];
		const src = sounds[Math.floor(Math.random() * sounds.length)];
		game.audio.play(src, { context: game.audio.interface });
	}

	#enableDoorOptions(isDoor) {
		const doorOptions = this.form.querySelector(".door-options");
		doorOptions.disabled = !isDoor;
		doorOptions.classList.toggle("hidden", !isDoor);
		this.setPosition({ height: "auto" });
	}

	#toggleThresholdInputVisibility() {
		const form = this.form;
		const showTypes = [CONST.WALL_SENSE_TYPES.PROXIMITY, CONST.WALL_SENSE_TYPES.DISTANCE];
		for (const sense of ["light", "sight", "sound"]) {
			const select = form[sense];
			const input = select.parentElement.querySelector(".proximity");
			input.classList.toggle("hidden", !showTypes.includes(Number(select.value)));
		}
	}
}
