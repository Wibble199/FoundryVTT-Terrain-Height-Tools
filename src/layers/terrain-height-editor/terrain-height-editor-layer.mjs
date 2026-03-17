import { terrainHeightEditorControlName, tools } from "../../consts.mjs";
import { heightMap } from "../../geometry/height-map.mjs";
import { activeControl$, activeTool$ } from "../../stores/scene-controls.mjs";
import { abortableEffect } from "../../utils/signal-utils.mjs";
import { ConvertShapeEditorTool } from "./editor-tools/convert-shape-editor-tool.mjs";
import { EraseCellsEditorTool } from "./editor-tools/erase-cells-editor-tool.mjs";
import { ErasePolygonEditorTool } from "./editor-tools/erase-polygon-editor-tool.mjs";
import { EraseShapeEditorTool } from "./editor-tools/erase-shape-editor-tool.mjs";
import { PaintCellsEditorTool } from "./editor-tools/paint-cells-editor-tool.mjs";
import { PaintPolygonEditorTool } from "./editor-tools/paint-polygon-editor-tool.mjs";
import { PipetteEditorTool } from "./editor-tools/pipette-editor-tool.mjs";
import { TerrainVisibilityEditorTool } from "./editor-tools/terrain-visibility-editor-tool.mjs";

/**
 * Layer for handling interaction with the terrain height data.
 * Individual tools are delegated to `EditorTool` classes, which neatly encapsulate all the logic and state required for
 * that tool.
 */
export class TerrainHeightEditorLayer extends InteractionLayer {

	static #tools = {
		[tools.convert]: ConvertShapeEditorTool,
		[tools.eraseCells]: EraseCellsEditorTool,
		[tools.erasePolygon]: ErasePolygonEditorTool,
		[tools.eraseShape]: EraseShapeEditorTool,
		// [tools.fill]: NYI
		[tools.paintCells]: PaintCellsEditorTool,
		[tools.paintPolygon]: PaintPolygonEditorTool,
		[tools.pipette]: PipetteEditorTool,
		[tools.terrainVisibility]: TerrainVisibilityEditorTool
	};

	/** @type {import("./tools/abstract/abstract-editor-tool.mjs").AbstractEditorTool | null} */
	#selectedTool = null;

	/** @type {AbortController} */
	#tearDownController;

	constructor() {
		super();
	}

	/** @return {TerrainHeightEditorLayer | undefined} */
	static get current() {
		return canvas.terrainHeightLayer;
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
		this.#setupEventListeners("on");
	}

	/** @override */
	_deactivate() {
		this.#setupEventListeners("off");
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
	/** @param {"on" | "off"} action */
	#setupEventListeners(action) {
		this[action]("mousedown", this.#onMouseDown);
		this[action]("rightdown", this.#onRightDown);
		this[action]("mousemove", this.#onMouseMove);
		this[action]("mouseup", this.#onMouseUp);
		this[action]("rightup", this.#onRightUp);
	}

	#onMouseDown = async event => {
		if (!this.#selectedTool || event.button !== 0) return;

		const { x, y } = this.toLocal(event.data.global);
		this.#selectedTool._onMouseDownLeft(x, y);
		this.#selectedTool.isMouseLeftDown = true;
	};

	#onRightDown = async event => {
		if (!this.#selectedTool) return;

		const { x, y } = this.toLocal(event.data.global);
		this.#selectedTool._onMouseDownRight(x, y);
		this.#selectedTool.isMouseRightDown = true;
	};

	#onMouseMove = async event => {
		const { x, y } = this.toLocal(event.data.global);
		this.#selectedTool?._onMouseMove(x, y);
	};

	#onMouseUp = async event => {
		if (!this.#selectedTool) return;

		const { x, y } = this.toLocal(event.data.global);
		this.#selectedTool._onMouseUpLeft(x, y);
		this.#selectedTool.isMouseLeftDown = false;
	};

	#onRightUp = async event => {
		if (!this.#selectedTool) return;

		const { x, y } = this.toLocal(event.data.global);
		this.#selectedTool._onMouseUpRight(x, y);
		this.#selectedTool.isMouseRightDown = true;
	};

	async clear() {
		await heightMap.clear();
	}

	get canUndo() {
		return heightMap._history.length > 0;
	}

	async undo() {
		return await heightMap.undo();
	}
}
