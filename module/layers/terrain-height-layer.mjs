import { moduleName, settings, tools } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { cellExists } from "../utils/array-utils.mjs";
import GridHighlightGraphics from "./grid-highlight-graphics.mjs";
import TerrainHeightGraphics from "./terrain-height-graphics.mjs";

/**
 * Layer for handling interaction with the terrain height data.
 * E.G. shows overlay previews and handles click events for painting/clearing.
 */
export default class TerrainHeightLayer extends InteractionLayer {

	/** @type {HeightMap | undefined} */
	#heightMap;

	/** @type {TerrainHeightGraphics | undefined} */
	graphics;

	/** @type {GridHighlightGraphics | undefined} */
	highlightGraphics;

	/** @type {PIXI.Graphics | undefined} */
	debugGraphics;

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
			this.#updateGraphics();
		} else {
			this.graphics = new TerrainHeightGraphics();
			game.canvas.primary.addChild(this.graphics);

			this.highlightGraphics = new GridHighlightGraphics();
			game.canvas.primary.addChild(this.highlightGraphics);

			this.debugGraphics = new PIXI.Graphics();
			this.debugGraphics.elevation = Infinity;
			game.canvas.primary.addChild(this.debugGraphics);

			this.#heightMap = new HeightMap(game.canvas.scene);

			this.graphics.update(this.#heightMap);
		}
	}

	/** @override */
	_activate() {
		// When this layer is activated (via the menu sidebar), always show the height map
		this.graphics.setVisible(true);
	}

	/** @override */
	_deactivate() {
		// When this layer is deactivated (via the menu sidebar), hide the height map unless configured to show
		this.graphics.setVisible(game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer));
	}

	/** @override */
	async _tearDown(options) {
		super._tearDown(options);

		if (this.graphics) game.canvas.primary.removeChild(this.graphics);
		this.graphics = undefined;

		if (this.highlightGraphics) game.canvas.primary.removeChild(this.highlightGraphics);
		this.highlightGraphics = undefined;

		if (this.debugGraphics) game.canvas.primary.removeChild(this.debugGraphics);
		this.debugGraphics = undefined;
	}

	async _onSceneUpdate(scene, data) {
		// Do nothing if the updated scene is not the one the user is looking at
		if (scene.id !== game.canvas.scene.id) return;

		this.#heightMap.reload();
		this.#updateGraphics();
	}

	// ---- //
	// Data //
	// ---- //
	#updateGraphics() {
		this.debugGraphics.clear();
		this.graphics.update(this.#heightMap);
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
				if (!cellExists(this.pendingChanges, row, col) && !this.#heightMap.has(row, col)) {
					this.pendingChanges.push([row, col]);
					this.highlightGraphics.color = 0xFF0000;
					this.highlightGraphics.highlight(row, col);
				}
				break;

			case tools.erase:
				if (!cellExists(this.pendingChanges, row, col) && this.#heightMap.has(row, col)) {
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
				if (await this.#heightMap.paintCells(pendingChanges))
					this.#updateGraphics();
				break;

			case tools.erase:
				if (await this.#heightMap.eraseCells(pendingChanges))
					this.#updateGraphics();
				break;
		}
	}

	async clear() {
		if (await this.#heightMap.clear())
			this.#updateGraphics(this.#heightMap);
	}

	// ------------------ //
	// Debug draw methods //
	// ------------------ //
	/** @param {Vertex} vertex */
	_debugDrawVertex(vertex, color = 0x00FF00) {
		if (!CONFIG.debug.terrainHeightLayer) return;

		this.debugGraphics
			.lineStyle({ width: 0 })
			.beginFill(color)
			.drawCircle(vertex.x, vertex.y, 5)
			.endFill();
	}

	/** @param {Edge} edge */
	_debugDrawEdge(edge, color = 0x00FF00) {
		this.debugDrawLine(edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y, color);
	}

	_debugDrawLine(x1, y1, x2, y2, color = 0x00FF00) {
		if (!CONFIG.debug.terrainHeightLayer) return;

		this.debugGraphics
			.lineStyle({ color: color, width: 2 })
			.moveTo(x1, y1)
			.lineTo(x2, y2);
	}

	_debugDrawRect(x1, y1, x2, y2, color = 0x00FF00) {
		if (!CONFIG.debug.terrainHeightLayer) return;

		this.debugGraphics
			.lineStyle({ color: color, width: 2 })
			.drawRect(x1, y1, x2 - x1, y2 - y1);
	}
}
