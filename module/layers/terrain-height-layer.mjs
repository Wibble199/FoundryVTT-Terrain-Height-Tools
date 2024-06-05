import { sceneControls } from "../config/controls.mjs";
import { moduleName, settings, tools } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { debug } from "../utils/log.mjs";
import { GridHighlightGraphics } from "./grid-highlight-graphics.mjs";
import { TerrainHeightGraphics } from "./terrain-height-graphics.mjs";

/**
 * Layer for handling interaction with the terrain height data.
 * E.G. shows overlay previews and handles click events for painting/clearing.
 */
export class TerrainHeightLayer extends InteractionLayer {

	/** @type {HeightMap | undefined} */
	_heightMap;

	/** @type {TerrainHeightGraphics | undefined} */
	_graphics;

	/** @type {GridHighlightGraphics | undefined} */
	_highlightGraphics;

	/** @type {string | undefined} */
	_pendingTool;

	/** @type {[number, number][]} */
	_pendingChanges = [];

	constructor() {
		super();
		Hooks.on("updateScene", this._onSceneUpdate.bind(this));
	}

	/** @override */
	static get layerOptions() {
		return mergeObject(super.layerOptions, {
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

		if (this._graphics) {
			await this._updateGraphics();
		} else {
			this._graphics = new TerrainHeightGraphics();
			game.canvas.interface.addChild(this._graphics);

			this._highlightGraphics = new GridHighlightGraphics();
			game.canvas.interface.addChild(this._highlightGraphics);

			this._heightMap = new HeightMap(game.canvas.scene);

			await this._graphics.update(this._heightMap);
		}
	}

	/** @override */
	_activate() {
		// When this layer is activated (via the menu sidebar), always show the height map
		this._graphics.setVisible(true);
		this._graphics._setMaskRadiusActive(false);

		// Start mouse event listeners
		this.#setupEventListeners("on");
	}

	/** @override */
	_deactivate() {
		// When this layer is deactivated (via the menu sidebar), hide the height map unless configured to show
		this._graphics.setVisible(game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer));
		this._graphics._setMaskRadiusActive(true);

		// Stop mouse event listeners
		this.#setupEventListeners("off");
	}

	/** @override */
	async _tearDown(options) {
		super._tearDown(options);

		if (this._graphics) game.canvas.primary.removeChild(this._graphics);
		this._graphics = undefined;

		if (this._highlightGraphics) game.canvas.primary.removeChild(this._highlightGraphics);
		this._highlightGraphics = undefined;
	}

	async _onSceneUpdate(scene, data) {
		// Do nothing if the updated scene is not the one the user is looking at
		if (scene.id !== game.canvas.scene.id) return;

		this._heightMap.reload();
		await this._updateGraphics();
	}

	// ---- //
	// Data //
	// ---- //
	async _updateGraphics() {
		await this._graphics?.update(this._heightMap);
	}

	// -------------------- //
	// Mouse event handling //
	// -------------------- //
	/** @param {"on" | "off"} action */
	#setupEventListeners(action) {
		this[action]("mousedown", this.#onMouseLeftDown);
		this[action]("mousemove", this.#onMouseMove);
		this[action]("mouseup", this.#onMouseLeftUp);
	}

	#onMouseLeftDown = async event => {
		const { x, y } = this.toLocal(event.data.global);
		await this.#beginTool(x, y);
	};

	#onMouseMove = async event => {
		if (!this._pendingTool) return;
		const { x, y } = this.toLocal(event.data.global);
		await this.#useTool(x, y);
	};

	#onMouseLeftUp = async () => {
		if (this._pendingTool === undefined) return;
		await this.#commitPendingToolUsage();
		this._pendingTool = undefined;
	};

	/**
	 * Handles initial tool usage.
	 * @param {number} x Local X coordinate of the event trigger.
	 * @param {number} y Local Y coordinate of the event trigger.
	 * @param {string} [tool=undefined]
	 */
	async #beginTool(x, y, tool) {
		// If a tool is already in use, ignore
		if (this._pendingTool !== undefined) return;

		this._pendingTool = tool ?? game.activeTool;

		// Set highlight colours depending on the tool
		switch (this._pendingTool) {
			case tools.paint:
				this._highlightGraphics._setColorFromTerrainTypeId(sceneControls.terrainHeightPalette?.selectedTerrainId);
				break;

			case tools.erase:
				this._highlightGraphics.color = 0x000000;
				break;
		}

		await this.#useTool(x, y);
	}

	/**
	 * Handles using a tool at the location. May add pending changes - e.g. if the user is clicking and dragging paint.
	 * @param {number} x Local X coordinate of the event trigger.
	 * @param {number} y Local Y coordinate of the event trigger.
	 * @param {string} [tool=undefined]
	 */
	async #useTool(x, y, tool = undefined) {
		/** @type {[number, number]} */
		const cell = game.canvas.grid.grid.getGridPositionFromPixels(x, y);

		switch (tool ?? this._pendingTool) {
			case tools.paint: {
				const existing = this._heightMap.get(...cell);
				const { selectedTerrainId, selectedHeight } = sceneControls.terrainHeightPalette ?? {};

				if (!this.#cellIsPending(...cell)
					&& (!existing || existing.terrainTypeId !== selectedTerrainId || existing.height !== selectedHeight)
					&& selectedTerrainId) {
					this._pendingChanges.push(cell);
					this._highlightGraphics.highlight(...cell);
				}
				break;
			}

			case tools.fill: {
				this._pendingTool = undefined;
				const { selectedTerrainId, selectedHeight } = sceneControls.terrainHeightPalette ?? {};
				if (selectedTerrainId && await this._heightMap.fillCells(cell, selectedTerrainId, selectedHeight))
					await this._updateGraphics();
				break;
			}

			case tools.erase: {
				if (!this.#cellIsPending(...cell) && this._heightMap.get(...cell)) {
					this._pendingChanges.push(cell);
					this._highlightGraphics.color = 0x000000;
					this._highlightGraphics.highlight(...cell);
				}
				break;
			}

			case tools.eraseFill: {
				this._pendingTool = undefined;
				if (await this._heightMap.eraseFillCells(cell))
					await this._updateGraphics();
				break;
			}

			case "dbg": {
				this._pendingTool = this.undefined;
				debug(`Clicked at ${x}, ${y} (cell ${cell[0]}, ${cell[1]})`);
				break;
			}

			default:
				return;
		}
	}

	/**
	 * Applys any pending tool usage - e.g. finishes a paint click-drag.
	 */
	async #commitPendingToolUsage() {
		// Clear pending changes and tool immediately (i.e. don't wait for the asynchronous work to complete) so that
		// repeated quick taps don't cause repeats/races
		const pendingChanges = this._pendingChanges;
		this._pendingChanges = [];

		const pendingTool = this._pendingTool;
		this._pendingTool = undefined;

		switch (pendingTool) {
			case tools.paint:
				const terrainId = sceneControls.terrainHeightPalette?.selectedTerrainId;
				const height = sceneControls.terrainHeightPalette?.selectedHeight;
				if (terrainId && await this._heightMap.paintCells(pendingChanges, terrainId, height))
					await this._updateGraphics();
				break;

			case tools.erase:
				if (await this._heightMap.eraseCells(pendingChanges))
					await this._updateGraphics();
				break;
		}

		this._highlightGraphics.clear();
	}

	async clear() {
		if (await this._heightMap.clear())
			await this._updateGraphics(this._heightMap);
	}

	get canUndo() {
		return this._heightMap._history.length > 0;
	}

	async undo() {
		return await this._heightMap.undo();
	}

	/**
	 * Returns whether or not the given cell is in the pending changes list.
	 * @param {number} row
	 * @param {number} col
	 */
	#cellIsPending(row, col) {
		return this._pendingChanges.some(cell => cell[0] === row && cell[1] === col);
	}
}
