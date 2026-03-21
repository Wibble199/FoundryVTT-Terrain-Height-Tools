import { getGridCellPolygon } from "../../../../utils/grid-utils.mjs";
import { AbstractEditorTool } from "./abstract-editor-tool.mjs";

/**
 * Base class from with tools that require the user to select one or more grid cells to use can extend from.
 */
export class AbstractCellEditorTool extends AbstractEditorTool {

	/** @type {Set<string>} */
	#pendingCells = new Set();

	/** @type {GridHighlight} */
	#graphics;

	#isDrawing = false;

	constructor() {
		super();

		this.#graphics = canvas.interface.addChild(new PIXI.Graphics());
	}

	/** @override */
	_onMouseDownLeft(x, y) {
		this.#isDrawing = this._canDraw();
		this.#highlightCell(x, y);
	}

	/** @override */
	_onMouseMove(x, y) {
		if (this.isMouseLeftDown)
			this.#highlightCell(x, y);
	}

	/** @override */
	_onMouseUpLeft() {
		if (!this.#isDrawing) return;

		this.#isDrawing = false;
		const selectedCells = [...this.#pendingCells].map(c => c.split("|").map(Number));
		this.#clearCells();
		this._use(selectedCells);
	}

	_cleanup() {
		super._cleanup();
		this.#clearCells();
		canvas.interface.removeChild(this.#graphics);
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	#highlightCell(x, y) {
		if (!this.#isDrawing) return;

		const { i, j } = canvas.grid.getOffset({ x, y });
		const cellKey = `${i}|${j}`;
		if (this.#pendingCells.has(cellKey)) return;

		this.#pendingCells.add(cellKey);
		this._configureHighlight(this.#graphics);
		this.#graphics.drawPolygon(getGridCellPolygon(i, j)).endFill();
	}

	#clearCells() {
		this.#graphics.clear();
		this.#pendingCells.clear();
	}

	/**
	 * Whether it is valid to draw a polygon.
	 * @protected
	 */
	_canDraw() {
		return true;
	}

	/**
	 * Called before highlighting a cell and should be used to configure the PIXI.Graphics instance to have the desired
	 * colours. E.G. `graphics.beginFill(0xFF0000);`.
	 * @param {PIXI.Graphics} graphics
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	_configureHighlight(graphics) {
	}

	/**
	 * Called when the user releases their mouse and the changes the tool makes should be applied.
	 * @param {[number, number][]} selectedCells
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	_use(selectedCells) {
	}
}
