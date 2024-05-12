import { tools } from "../consts.mjs";
import { getTerrainColor, getTerrainTypeMap } from "../utils/terrain-types.mjs";

/**
 * @typedef {Object} Point3D
 * @property {number} x
 * @property {number} y
 * @property {number} h
 */

export class LineOfSightRulerLayer extends CanvasLayer {

	#cursorHeight = 1;

	/** @type {Point3D | undefined} */
	#dragStartPoint = undefined;

	/** @type {Map<string, PIXI.Graphics>} */
	#rulers = new Map();

	/** @override */
	static get layerOptions() {
		return mergeObject(super.layerOptions, {
			zIndex: 300
		});
	}

	get isToolSelected() {
		return game.activeTool === tools.lineOfSight;
	}

	/** @override */
	async _draw() {
		this.#setupEventListeners("on");
	}

	/** @override */
	async _tearDown() {
		await super._tearDown();
	}

	// ----------------------- //
	// Calculation & rendering //
	// ----------------------- //
	/**
	 * Draws a line of sight ruler on the map, from the given start and end points and the given intersection regions.
	 * @param {Point3D} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {Point3D} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {string} [userId=undefined] ID of the user that is drawing the LOS ruler. Defaults to current user.
	 */
	_drawLineOfSightRay(p1, p2, userId = undefined) {
		userId ??= game.userId;

		let ruler = this.#rulers.get(userId);
		if (!ruler) {
			ruler = new PIXI.Graphics();
			this.addChild(ruler);
			this.#rulers.set(userId, ruler);
		} else {
			ruler.clear();
		}

		// Calculate line of sight
		/** @type {import("../geometry/height-map.mjs").HeightMap} */
		const hm = game.canvas.terrainHeightLayer._heightMap;
		const intersectionRegions = hm.calculateLineOfSight(p1, p2);

		// Render line of sight
		const terrainTypes = getTerrainTypeMap();

		let { h: _, ...lastPosition } = p1;
		for (let i = 0; i < intersectionRegions.length; i++) {
			const r = intersectionRegions[i];

			// If there is a gap between this region's start and the previous region's end (or the start of the ray if
			// this is the first region), draw a default ruler line.
			if (lastPosition.x !== r.start.x || lastPosition.y !== r.start.y) {
				ruler.lineStyle({ color: 0xFFFFFF, width: 4 });
				ruler.moveTo(lastPosition.x, lastPosition.y);
				ruler.lineTo(r.start.x, r.start.y);
			}

			// Draw the intersection region (in the color of the intersected terrain)
			const terrainColor = getTerrainColor(terrainTypes.get(r.terrainTypeId) ?? {});
			ruler.lineStyle({ color: terrainColor, width: 4 });
			ruler.moveTo(r.start.x, r.start.y);
			ruler.lineTo(r.end.x, r.end.y);
			lastPosition = r.end;
		}

		// If there is a gap between the last region's end point (or the start of the ray if there are no regions) and
		// the end point of the ray, draw a default line between these two points
		if (lastPosition.x !== p2.x || lastPosition.y !== p2.y) {
			ruler.lineStyle({ color: 0xFFFFFF, width: 4 });
			ruler.moveTo(lastPosition.x, lastPosition.y);
			ruler.lineTo(p2.x, p2.y);
		}
	}

	/**
	 * Removes a line of sight
	 * @param {string} userId The ID of the user whose LOS ruler to remove. Defaults to current user.
	 */
	_clearLineOfSightRay(userId = undefined) {
		userId ??= game.userId;

		const ruler = this.#rulers.get(userId);
		if (ruler) {
			this.removeChild(ruler);
			this.#rulers.delete(userId);
		}
	}

	// -------------------- //
	// Mouse event handling //
	// -------------------- //
	/** @param {"on" | "off"} action */
	#setupEventListeners(action) {
		const { interaction } = game.canvas.app.renderer.plugins;
		interaction[action]("mousedown", this.#onMouseLeftDown);
		interaction[action]("mousemove", this.#onMouseMove);
		interaction[action]("mouseup", this.#onMouseLeftUp);
	}

	#onMouseLeftDown = event => {
		if (!this.isToolSelected) return;

		const [x, y] = this.#getDragPosition(event);
		this.#dragStartPoint = { x, y, h: this.#cursorHeight };
	};

	#onMouseMove = event => {
		if (!this.#dragStartPoint) return;

		const [x, y] = this.#getDragPosition(event);
		this._drawLineOfSightRay(this.#dragStartPoint, { x, y, h: this.#cursorHeight });
	};

	#onMouseLeftUp = () => {
		this.#dragStartPoint = undefined;
		this._clearLineOfSightRay();
	};

	/** @returns {[number, number]} */
	#getDragPosition(event) {
		let { x, y } = this.toLocal(event.data.global);
		const snap = !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
		if (!snap) return [x, y];

		// TODO: snap to nearest cell center or cell corner
		return [x, y];
	}
}
