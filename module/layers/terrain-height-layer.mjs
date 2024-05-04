import { sceneControls } from "../config/controls.mjs";
import { moduleName, settings, tools } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { GridHighlightGraphics } from "./grid-highlight-graphics.mjs";
import { TerrainHeightGraphics } from "./terrain-height-graphics.mjs";

/**
 * Layer for handling interaction with the terrain height data.
 * E.G. shows overlay previews and handles click events for painting/clearing.
 */
export class TerrainHeightLayer extends InteractionLayer {

	/** @type {HeightMap | undefined} */
	#heightMap;

	/** @type {TerrainHeightGraphics | undefined} */
	graphics;

	/** @type {GridHighlightGraphics | undefined} */
	highlightGraphics;

	/** @type {[number, number][]} */
	pendingChanges = [];

	constructor() {
		super();
		Hooks.on("updateScene", this._onSceneUpdate.bind(this));
	}

	/** @override */
	static get layerOptions() {
		return mergeObject(super.layerOptions, {
			zIndex: 300
		});
	}

	// -------------- //
	// Event handlers //
	// -------------- //
	/** @override */
	async _draw(options) {
		super._draw(options);

		if (this.graphics) {
			// TODO: is it sensible to redraw graphics on _draw? When exactly does _draw get called?
			await this._updateGraphics();
		} else {
			this.graphics = new TerrainHeightGraphics();
			game.canvas.primary.addChild(this.graphics);

			this.highlightGraphics = new GridHighlightGraphics();
			game.canvas.primary.addChild(this.highlightGraphics);

			this.#heightMap = new HeightMap(game.canvas.scene);

			await this.graphics.update(this.#heightMap);
		}
	}

	/** @override */
	_activate() {
		// When this layer is activated (via the menu sidebar), always show the height map
		this.graphics.setVisible(true);
		this.graphics._setMaskRadiusActive(false);
	}

	/** @override */
	_deactivate() {
		// When this layer is deactivated (via the menu sidebar), hide the height map unless configured to show
		this.graphics.setVisible(game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer));
		this.graphics._setMaskRadiusActive(true);
	}

	/** @override */
	async _tearDown(options) {
		super._tearDown(options);

		if (this.graphics) game.canvas.primary.removeChild(this.graphics);
		this.graphics = undefined;

		if (this.highlightGraphics) game.canvas.primary.removeChild(this.highlightGraphics);
		this.highlightGraphics = undefined;
	}

	async _onSceneUpdate(scene, data) {
		// Do nothing if the updated scene is not the one the user is looking at
		if (scene.id !== game.canvas.scene.id) return;

		this.#heightMap.reload();
		await this._updateGraphics();
	}

	// ---- //
	// Data //
	// ---- //
	async _updateGraphics() {
		await this.graphics.update(this.#heightMap);
	}

	// -------------------- //
	// Mouse event handling //
	// -------------------- //
	/** @override */
	_onClickLeft(event) {
		const { x, y } = event.data.origin;
		this.#useTool(x, y);
		this.#commitPendingToolUsage();
	}

	/** @override */
	_onDragLeftMove(event) {
		const { x, y } = event.data.destination;
		this.#useTool(x, y);
	}

	_onDragLeftDrop(event) {
		this.#commitPendingToolUsage();
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {string} [tool]
	 * @returns
	 */
	#useTool(x, y, tool = undefined) {
		const [row, col] = game.canvas.grid.grid.getGridPositionFromPixels(x, y);

		switch (tool ?? game.activeTool) {
			case tools.paint:
				const existing = this.#heightMap.get(row, col);
				const { selectedTerrainId, selectedHeight } = sceneControls.terrainHeightPicker ?? {};

				if (!this.#cellIsPending(row, col)
					&& (!existing || existing.terrainTypeId !== selectedTerrainId || existing.height !== selectedHeight)
					&& sceneControls.terrainHeightPicker?.selectedTerrainId) {
					this.pendingChanges.push([row, col]);
					this.highlightGraphics.color = 0xFF0000;
					this.highlightGraphics.highlight(row, col);
				}
				break;

			case tools.erase:
				if (!this.#cellIsPending(row, col) && this.#heightMap.get(row, col)) {
					this.pendingChanges.push([row, col]);
					this.highlightGraphics.color = 0x000000;
					this.highlightGraphics.highlight(row, col);
				}
				break;

			default:
				return;
		}
	}

	async #commitPendingToolUsage(tool = undefined) {
		const pendingChanges = this.pendingChanges;
		this.pendingChanges = [];
		this.highlightGraphics.clear();

		switch (tool ?? game.activeTool) {
			case tools.paint:
				const terrainId = sceneControls.terrainHeightPicker?.selectedTerrainId;
				const height = sceneControls.terrainHeightPicker?.selectedHeight;
				if (terrainId && await this.#heightMap.paintCells(pendingChanges, terrainId, height))
					await this._updateGraphics();
				break;

			case tools.erase:
				if (await this.#heightMap.eraseCells(pendingChanges))
					await this._updateGraphics();
				break;
		}
	}

	async clear() {
		if (await this.#heightMap.clear())
			await this._updateGraphics(this.#heightMap);
	}

	/**
	 * Returns whether or not the given cell is in the pending changes list.
	 * @param {number} row
	 * @param {number} col
	 */
	#cellIsPending(row, col) {
		return this.pendingChanges.some(cell => cell[0] === row && cell[1] === col);
	}
}
