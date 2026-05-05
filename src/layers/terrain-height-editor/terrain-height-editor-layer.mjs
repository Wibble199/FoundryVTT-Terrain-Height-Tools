import { terrainHeightEditorControlName, tools } from "../../consts.mjs";
import { heightMap } from "../../geometry/height-map.mjs";
import { activeControl$, activeTool$ } from "../../stores/scene-controls.mjs";
import { abortableEffect } from "../../utils/signal-utils.mjs";
import { ConvertShapeEditorTool } from "./editor-tools/convert-shape-editor-tool.mjs";
import { EraseEditorTool } from "./editor-tools/erase-editor-tool.mjs";
import { EraseShapeEditorTool } from "./editor-tools/erase-shape-editor-tool.mjs";
import { FillEditorTool } from "./editor-tools/fill-editor-tool.mjs";
import { PaintEditorTool } from "./editor-tools/paint-editor-tool.mjs";
import { PipetteEditorTool } from "./editor-tools/pipette-editor-tool.mjs";
import { TerrainVisibilityEditorTool } from "./editor-tools/terrain-visibility-editor-tool.mjs";

const { InteractionLayer } = foundry.canvas.layers;

/**
 * Layer for handling interaction with the terrain height data.
 * Individual tools are delegated to `EditorTool` classes, which neatly encapsulate all the logic and state required for
 * that tool.
 */
export class TerrainHeightEditorLayer extends InteractionLayer {

	#lastPointerButtons = 0;

	static #tools = {
		[tools.convert]: ConvertShapeEditorTool,
		[tools.erase]: EraseEditorTool,
		[tools.eraseShape]: EraseShapeEditorTool,
		[tools.fill]: FillEditorTool,
		[tools.paint]: PaintEditorTool,
		[tools.pipette]: PipetteEditorTool,
		[tools.terrainVisibility]: TerrainVisibilityEditorTool
	};

	/** @type {import("./editor-tools/abstract/abstract-editor-tool.mjs").AbstractEditorTool | null} */
	#selectedTool = null;

	/** @type {AbortController} */
	#tearDownController;

	constructor() {
		super();
	}

	/** @override */
	static get layerOptions() {
		return foundry.utils.mergeObject(super.layerOptions, {
			baseClass: InteractionLayer,
			zIndex: 300
		});
	}

	// -------------- //
	// Event handlers //
	// -------------- //
	/** @override */
	async _draw(options) {
		super._draw(options);

		this.#tearDownController = new AbortController();
		const tearDownSignal = this.#tearDownController.signal;

		// Load the relevant tool class when the selected tool changes
		abortableEffect(() => {
			if (activeControl$.value === terrainHeightEditorControlName) {
				const selectedToolClass = TerrainHeightEditorLayer.#tools[activeTool$.value];
				if (selectedToolClass && this.#selectedTool instanceof selectedToolClass) return;
				this.#selectedTool?._cleanup();
				this.#selectedTool = selectedToolClass ? new selectedToolClass() : null;

			} else {
				this.#selectedTool?._cleanup();
				this.#selectedTool = null;
			}
		}, tearDownSignal);
	}

	/** @override */
	_activate() {
		this.#setupEventListeners(true);
	}

	/** @override */
	_deactivate() {
		this.#setupEventListeners(false);
	}

	/** @override */
	_tearDown(options) {
		super.tearDown(options);

		this.#selectedTool?._cleanup();
		this.#selectedTool = null;
	}

	// -------------------- //
	// Mouse event handling //
	// -------------------- //
	/** @param {boolean} enable */
	#setupEventListeners(enable) {
		const onOff = enable ? "on" : "off";
		this[onOff]("pointermove", this.#onPointerMove);
		this[onOff]("pointerdown", this.#checkPointerButtons);
		this[onOff]("pointerup", this.#checkPointerButtons);

		const addRemove = enable ? "addEventListener" : "removeEventListener";
		document[addRemove]("keydown", this.#onKeyDown);
		document[addRemove]("keyup", this.#onKeyUp);
	}

	// Seems like a pointerdown event doesn't fire if a button is already being held, but a pointermove event fires in
	// this case instead. https://github.com/pixijs/pixijs/issues/4048#issuecomment-304517070
	// So, if there are any buttons down, then we let the onPointerMove handler also check for changes in which buttons
	// are down. We do not however do this when a button is not down, because the pointermove event also fires when the
	// user's cursor is under a window, e.g. we end up drawing if the user is dragging/dropping to move a window.

	/** @param {PIXI.FederatedPointerEvent} event */
	#onPointerMove = event => {
		const { x, y } = this.toLocal(event.data.global);

		if (this.#lastPointerButtons > 0) {
			this.#checkPointerButtons(event);
		}

		this.#throttledMouseMove(x, y);
	};

	/** @param {PIXI.FederatedPointerEvent} event */
	#checkPointerButtons(event) {
		const { x, y } = this.toLocal(event.data.global);

		// Left mouse button
		const isLeftDown = (event.buttons & 1) === 1;
		const wasLeftDown = (this.#lastPointerButtons & 1) === 1;
		if (this.#selectedTool) {
			if (isLeftDown && !wasLeftDown) this.#selectedTool._onMouseDownLeft(x, y);
			else if (!isLeftDown && wasLeftDown) this.#selectedTool._onMouseUpLeft(x, y);
		}

		// Right mouse button
		const isRightDown = (event.buttons & 2) === 2;
		const wasRightDown = (this.#lastPointerButtons & 2) === 2;
		if (this.#selectedTool) {
			if (isRightDown && !wasRightDown) this.#selectedTool._onMouseDownRight(x, y);
			else if (!isRightDown && wasRightDown) this.#selectedTool._onMouseUpRight(x, y);
		}

		this.#lastPointerButtons = event.buttons;
	}

	// Throttle mouse updates to 60fps
	/** @type {(x: number, y: number) => void} */
	#throttledMouseMove = foundry.utils.throttle((x, y) => {
		this.#selectedTool?._onMouseMove(x, y);
	}, 1000 / 60);

	/** @param {KeyboardEvent} event */
	#onKeyDown = event => {
		this.#selectedTool?._onKeyDown(event);
	};

	/** @param {KeyboardEvent} event */
	#onKeyUp = event => {
		this.#selectedTool?._onKeyUp(event);
	};

	/** @override */
	async _onUndoKey() {
		if (heightMap.canUndo) {
			return await heightMap.undo();
		}
	}
}
