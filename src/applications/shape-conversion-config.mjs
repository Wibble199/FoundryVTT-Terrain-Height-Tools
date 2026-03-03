import { moduleName, wallHeightModuleName } from "../consts.mjs";
import { convertConfig$ } from "../stores/drawing.mjs";
import { withSubscriptions } from "./with-subscriptions.mixin.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShapeConversionConifg extends withSubscriptions(HandlebarsApplicationMixin(ApplicationV2)) {

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

	static PARTS = {
		main: {
			template: `modules/${moduleName}/templates/shape-conversion-config.hbs`
		}
	};

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	async _prepareContext() {
		return {
			isWallHeightEnabled: game.modules.get(wallHeightModuleName)?.active ?? false
		};
	}

	/** @override */
	_onRender() {
		this._unsubscribeFromAll();
		this._subscriptions = [
			convertConfig$.subscribe(v => {
				this.element.querySelector("[name='toDrawing']").checked = v.toDrawing;
				this.element.querySelector("[name='toRegion']").checked = v.toRegion;
				this.element.querySelector("[name='toWalls']").checked = v.toWalls;
				this.element.querySelector("[name='deleteAfter']").checked = v.deleteAfter;

				const setWallHeightFlags = this.element.querySelector("[name='setWallHeightFlags']");
				if (setWallHeightFlags) {
					setWallHeightFlags.checked = v.setWallHeightFlags;
					setWallHeightFlags.disabled = !v.toWalls;
				}
			}, true)
		];

		this.element.querySelectorAll("input").forEach(el => el.addEventListener("input", e => {
			const { name, checked } = e.target;
			convertConfig$.value = { [name]: checked };
		}));

		this.element.querySelector("[data-action='configure-walls']").addEventListener("click", () => {
			new WallConversionConfig().render(true);
		});
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
			...convertConfig$.wallConfig$.value,
			flags: {},
		};
		context.p0 = { x: 0, y: 0 };
		context.p1 = { x: 1, y: 1 };

		context.gridUnits = game.i18n.localize("GridUnits");

		// Copied from the normal WallConfig
		context.moveTypes = Object.keys(CONST.WALL_MOVEMENT_TYPES).reduce((obj, key) => {
			let k = CONST.WALL_MOVEMENT_TYPES[key];
			obj[k] = game.i18n.localize(`WALLS.SenseTypes.${key}`);
			return obj;
		}, {});
		context.senseTypes = Object.keys(CONST.WALL_SENSE_TYPES).reduce((obj, key) => {
			let k = CONST.WALL_SENSE_TYPES[key];
			obj[k] = game.i18n.localize(`WALLS.SenseTypes.${key}`);
			return obj;
		}, {});
		context.dirTypes = Object.keys(CONST.WALL_DIRECTIONS).reduce((obj, key) => {
			let k = CONST.WALL_DIRECTIONS[key];
			obj[k] = game.i18n.localize(`WALLS.Directions.${key}`);
			return obj;
		}, {});
		context.doorTypes = Object.keys(CONST.WALL_DOOR_TYPES).reduce((obj, key) => {
			let k = CONST.WALL_DOOR_TYPES[key];
			obj[k] = game.i18n.localize(`WALLS.DoorTypes.${key}`);
			return obj;
		}, {});
		context.doorStates = Object.keys(CONST.WALL_DOOR_STATES).reduce((obj, key) => {
			let k = CONST.WALL_DOOR_STATES[key];
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
		convertConfig$.wallConfig$.value = newWallConfig;
	}

	activateListeners(html) {
		html.find(".audio-preview").click(this.#onAudioPreview.bind(this));
		this.#enableDoorOptions(convertConfig$.wallConfig$.door$.value > CONST.WALL_DOOR_TYPES.NONE);
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
		game.audio.play(src, {context: game.audio.interface});
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

window.wallConfig = convertConfig$.wallConfig$;
