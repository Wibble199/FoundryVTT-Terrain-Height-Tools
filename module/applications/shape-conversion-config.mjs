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
 * Converted from FormApplication to ApplicationV2 for V13 compatibility.
 */
class WallConversionConfig extends HandlebarsApplicationMixin(ApplicationV2) {

	#audioPreviewState = 0;

	static DEFAULT_OPTIONS = {
		id: "tht_wallConversionConfig",
		tag: "form",
		classes: ["sheet", "wall-config"],
		window: {
			title: "DOCUMENT.Wall",
		},
		position: {
			width: 400,
			height: "auto"
		},
		form: {
			handler: WallConversionConfig.#onFormSubmit,
			closeOnSubmit: true
		}
	};

	static PARTS = {
		main: {
			template: "templates/scene/wall-config.html"
		}
	};

	/** @override */
	async _prepareContext() {
		const context = {};

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

	/**
	 * @this {WallConversionConfig}
	 */
	static #onFormSubmit(_event, _form, formData) {
		const newWallConfig = foundry.utils.expandObject(formData.object);
		delete newWallConfig.flags;
		convertConfig$.wallConfig$.value = newWallConfig;
	}

	/** @override */
	_onRender() {
		const form = this.element;

		// Audio preview
		form.querySelector(".audio-preview")?.addEventListener("click", this.#onAudioPreview.bind(this));

		// Enable/disable door options based on current value
		this.#enableDoorOptions(convertConfig$.wallConfig$.door$.value > CONST.WALL_DOOR_TYPES.NONE);
		this.#toggleThresholdInputVisibility();

		// Listen for input changes using event delegation on the form
		form.addEventListener("change", event => {
			const name = event.target.name;
			if (name === "door") {
				this.#enableDoorOptions(Number(event.target.value) > CONST.WALL_DOOR_TYPES.NONE);
			} else if (name === "doorSound") {
				this.#audioPreviewState = 0;
			} else if (["light", "sight", "sound"].includes(name)) {
				this.#toggleThresholdInputVisibility();
			}
		});
	}

	#onAudioPreview() {
		const form = this.element;
		const doorSoundEl = form.querySelector("[name='doorSound']");
		const doorSoundName = doorSoundEl?.value;
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
		const doorOptions = this.element.querySelector(".door-options");
		if (!doorOptions) return;
		doorOptions.disabled = !isDoor;
		doorOptions.classList.toggle("hidden", !isDoor);
		this.setPosition({ height: "auto" });
	}

	#toggleThresholdInputVisibility() {
		const form = this.element;
		const showTypes = [CONST.WALL_SENSE_TYPES.PROXIMITY, CONST.WALL_SENSE_TYPES.DISTANCE];
		for (const sense of ["light", "sight", "sound"]) {
			const select = form.querySelector(`[name='${sense}']`);
			if (!select) continue;
			const input = select.parentElement.querySelector(".proximity");
			if (input) input.classList.toggle("hidden", !showTypes.includes(Number(select.value)));
		}
	}
}

window.wallConfig = convertConfig$.wallConfig$;
