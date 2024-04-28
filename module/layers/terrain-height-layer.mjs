import { tools } from "../consts.mjs";
import TerrainHeightGraphics from "./terrain-height-graphics.mjs";

const tempData = {
	gridCoordinates: []
};

/**
 * Layer for handling interaction with the terrain height data.
 * E.G. shows overlay previews and handles click events for painting/clearing.
 */
export default class TerrainHeightLayer extends InteractionLayer {

	constructor() {
		super();

		/** @type {TerrainHeightGraphics | undefined} */
		this.graphics = undefined;

		/** @type {PIXI.Graphics | undefined} */
		this.debugGraphics = undefined;

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
			this.graphics.update(tempData);
		} else {
			this.graphics = new TerrainHeightGraphics();
			canvas.primary.addChild(this.graphics);

			this.debugGraphics = new PIXI.Graphics();
			this.debugGraphics.elevation = Infinity;
			canvas.primary.addChild(this.debugGraphics);
		}
	}

	/** @override */
	async _tearDown(options) {
		super._tearDown(options);

		if (this.graphics) canvas.primary.removeChild(this.graphics);
		this.graphics = undefined;

		if (this.debugGraphics) canvas.primary.removeChild(this.debugGraphics);
		this.debugGraphics = undefined;
	}

	async _onSceneUpdate(scene, data) {
		// TODO: update the drawings if the height data has been updated
		this.graphics.update(tempData);
	}

	// -------------------- //
	// Mouse event handling //
	// -------------------- //
	/** @override */
	_onClickLeft(event) {
		const { x, y } = event.data.origin;
		this.#useTool(x, y);
	}

	/** @override */
	_onDragLeftMove(event) {
		const { x, y } = event.data.destination;
		this.#useTool(x, y);
	}

	// TODO: maybe use own interaction rather than using the InteractionLayer so that we can handle right-click drags
	// to erase an area under the mouse

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {string} [tool]
	 * @returns
	 */
	#useTool(x, y, tool = undefined) {
		const [row, col] = canvas.grid.grid.getGridPositionFromPixels(x, y);

		switch (tool ?? game.activeTool) {
			case tools.paint:
				if (tempData.gridCoordinates.find(c => c[0] === row && c[1] === col))
					return;
				tempData.gridCoordinates.push([row, col]);
				// Need to be sorted top to bottom, left to right so that the polygon merge hole detection works properly.
				tempData.gridCoordinates.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
				break;

			case tools.erase:
				const idx = tempData.gridCoordinates.findIndex(c => c[0] === row && c[1] === col);
				if (idx < 0) return;
				tempData.gridCoordinates.splice(idx, 1);
				break;

			default:
				return;
		}

		this.debugGraphics.clear();
		this.graphics.update(tempData);
	}

	clear() {
		tempData.gridCoordinates = [];
		this.debugGraphics.clear();
		this.graphics.update(tempData);
	}

	// ------------------ //
	// Debug draw methods //
	// ------------------ //
	/** @param {Vertex} vertex */
	_debugDrawVertex(vertex, color = 0x00FF00) {
		if (!CONFIG.debug.terrainHeightLayer) return;

		this.debugGraphics
			.lineStyle({ width: 0 })
			.beginFill({ color })
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
