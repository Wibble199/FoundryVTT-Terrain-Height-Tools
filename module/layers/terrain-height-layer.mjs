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
		Hooks.on("updateScene", this._onSceneUpdate.bind(this));
	}

	/** @override */
	static get layerOptions() {
		return mergeObject(super.layerOptions, {
			zIndex: 300
		});
	}

	/** @type {TerrainHeightGraphics} */
	get graphics() {
		return canvas.primary.children.find(c => c instanceof TerrainHeightGraphics);
	}

	async _onSceneUpdate(scene, data) {
		// TODO: update the drawings if the height data has been updated
		this.graphics.update(tempData);
	}

	/** @override */
	async _draw(options) {
		super._draw(options);

		// TODO: is it sensible to redraw graphics on _draw? When exactly does _draw get called?
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

		this.graphics.update(tempData);
	}
}
