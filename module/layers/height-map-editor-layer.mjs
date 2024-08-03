import { tools } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { getGridCellPolygon } from "../utils/grid-utils.mjs";
import { Signal } from "../utils/reactive.mjs";
import { getTerrainColor, getTerrainType } from "../utils/terrain-types.mjs";

/**
 * Layer for handling editing operations with the current scene's height map data.
 */
export class HeightMapEditorLayer extends InteractionLayer {

	/** @type {PIXI.Graphics} */
	#graphics;

	static get layerOptions() {
		return foundry.utils.mergeObject(super.layerOptions, {
			zIndex: 300
		});
	}

	// --------------- //
	// Layer Lifecycle //
	// --------------- //
	/** @override */
	async _draw(options) {
		super._draw(options);

		this.#graphics = this.addChild(new PIXI.Graphics());
	}

	/** @override */
	_activate() {
		this.#configureEventListeners("on");
	}

	_deactivate() {
		this.#pendingTool = undefined;
		this.#pendingCells = [];

		this.#configureEventListeners("off");
	}


	// -------------- //
	// Event Handling //
	// -------------- //
	/** @param {"on" | "off"} mode */
	#configureEventListeners(mode) {
		this[mode]("mousedown", this.#onMouseDown);
		this[mode]("mousemove", this.#onMouseMove);
		this[mode]("mouseup", this.#onMouseUp);
	}

	#onMouseDown = async event => {
		if (event.button !== 0) return;
		const { x, y } = this.toLocal(event.data.global);
		await this.#beginTool(x, y);
	};

	#onMouseMove = async event => {
		if (!this.#pendingTool) return;
		const { x, y } = this.toLocal(event.data.global);
		await this.#useTool(x, y);
	};

	#onMouseUp = async event => {
		if (this.#pendingTool === undefined || event.button !== 0) return;
		await this.#commitPendingToolUsage();
		this.#pendingTool = undefined;
	};


	// ------- //
	// Drawing //
	// ------- //
	/** @type {Signal<string | undefined>} */
	_selectedPaintingTerrainTypeId$ = new Signal(undefined);

	/** @type {Signal<number>} */
	_selectedPaintingHeight$ = new Signal(1);

	/** @type {Signal<number>} */
	_selectedPaintingElevation$ = new Signal(0);

	/** @type {string | undefined} */
	#pendingTool;

	/** @type {[number, number][]} */
	#pendingCells = [];

	get #paintingConfig() {
		const selectedTerrainId = this._selectedPaintingTerrainTypeId$.value;
		const usesHeight = getTerrainType(selectedTerrainId)?.usesHeight ?? false;
		const selectedHeight = usesHeight ? this._selectedPaintingHeight$.value : 0;
		const selectedElevation = usesHeight ? this._selectedPaintingElevation$.value : 0;
		return { selectedTerrainId, selectedHeight, selectedElevation };
	}

	/**
	 * Handles initial tool usage: initialises the tool if required (e.g. setting highlight color) and calls `#useTool`.
	 * @param {number} x Local X coordinate of the event trigger.
	 * @param {number} y Local Y coordinate of the event trigger.
	 * @param {string} [tool=undefined]
	 */
	async #beginTool(x, y, tool) {
		// If a tool is already in use, ignore
		if (this.#pendingTool !== undefined) return;

		this.#pendingTool = tool ?? game.activeTool;

		// Set highlight colours depending on the tool
		switch (this.#pendingTool) {
			case tools.paint:
				this.#setHighlightColorFromTerrainTypeId(this._selectedPaintingTerrainTypeId$.value);
				break;

			case tools.erase:
				this.#highlightColor = 0x000000;
				break;
		}

		await this.#useTool(x, y);
	}

	/**
	 * Handles using a tool at the location. Behaviour depends on the specified or pending tool:
	 * - May add pending changes - e.g. if the user is clicking and dragging paint.
	 * - May immediately commit a change - e.g. when the user uses the fill tool
	 * @param {number} x Local X coordinate of the event trigger.
	 * @param {number} y Local Y coordinate of the event trigger.
	 * @param {string} [tool=undefined]
	 */
	async #useTool(x, y, tool = undefined) {
		/** @type {[number, number]} */
		const cell = canvas.grid.grid.getGridPositionFromPixels(x, y);

		switch (tool ?? this.#pendingTool) {
			case tools.paint: {
				const existing = HeightMap.current.get(...cell);
				const { selectedTerrainId, selectedHeight, selectedElevation } = this.#paintingConfig;

				if (!this.#cellIsPending(...cell)
					&& (!existing || existing.terrainTypeId !== selectedTerrainId || existing.height !== selectedHeight || existing.elevation !== selectedElevation)
					&& selectedTerrainId) {
					this.#pendingCells.push(cell);
					this.#highlightGridCell(...cell);
				}
				break;
			}

			case tools.fill: {
				this.#pendingTool = undefined;
				const { selectedTerrainId, selectedHeight, selectedElevation } = this.#paintingConfig;
				if (selectedTerrainId)
					await HeightMap.current.fillCells(cell, selectedTerrainId, selectedHeight, selectedElevation);
				break;
			}

			case tools.pipette: {
				const cellData = HeightMap.current.get(...cell);
				if (!cellData) break;

				this._selectedPaintingTerrainTypeId$.value = cellData.terrainTypeId;
				this._selectedPaintingHeight$.value = Math.max(cellData.height, 1);
				this._selectedPaintingElevation$.value = Math.max(cellData.elevation, 0);

				// Select the paintbrush tool. This feels like a horrible dirty way of doing this, but there doesn't
				// seem to be any API exposed by Foundry to set the tool without pretending to click the button.
				document.querySelector(`#tools-panel-${moduleName} [data-tool="${tools.paint}"]`)?.click();
				this.#pendingTool = undefined;

				break;
			}

			case tools.erase: {
				if (!this.#cellIsPending(...cell) && HeightMap.current.get(...cell)) {
					this.#pendingCells.push(cell);
					this.#highlightColor = 0x000000;
					this.#highlightGridCell(...cell);
				}
				break;
			}

			case tools.eraseFill: {
				this.#pendingTool = undefined;
				await HeightMap.current.eraseFillCells(cell);
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
		const pendingChanges = this.#pendingCells;
		this.#pendingCells = [];

		const pendingTool = this.#pendingTool;
		this.#pendingTool = undefined;

		switch (pendingTool) {
			case tools.paint:
				const { selectedTerrainId, selectedHeight, selectedElevation } = this.#paintingConfig;
				if (selectedTerrainId)
					await HeightMap.current.paintCells(pendingChanges, selectedTerrainId, selectedHeight, selectedElevation)
				break;

			case tools.erase:
				await HeightMap.current.eraseCells(pendingChanges);
				break;
		}

		this.#clearHighlightedCells();
	}

	/**
	 * Returns whether or not the given cell is in the pending changes list.
	 * @param {number} row
	 * @param {number} col
	 */
	#cellIsPending(row, col) {
		return this.#pendingCells.some(cell => cell[0] === row && cell[1] === col);
	}

	async clear() {
		await HeightMap.current.clear();
	}

	get canUndo() {
		return HeightMap.current.canUndo;
	}

	async undo() {
		return await HeightMap.current.undo();
	}


	// ---------------------- //
	// Grid Cell Highlighting //
	// ---------------------- //
	/** Colour to highlight cells with. */
	#highlightColor = 0xFFFFFF;

	/**
	 * Highlights the specified grid cell.
	 * @param {number} row
	 * @param {number} col
	 */
	#highlightGridCell(row, col) {
		this.#graphics
			.beginFill(this.#highlightColor, 0.4)
			.drawPolygon(getGridCellPolygon(row, col))
			.endFill()
	}

	#clearHighlightedCells() {
		this.#graphics.clear();
	}

	/**
	 * Sets the highlight colour based on the given terrain type ID.
	 * @param {string} terrainTypeId
	 */
	#setHighlightColorFromTerrainTypeId(terrainTypeId) {
		const terrainType = getTerrainType(terrainTypeId);
		if (terrainType)
			this.#highlightColor = getTerrainColor(terrainType);
	}
}
