import { tools } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { getGridCellPolygon, getGridCenter } from "../utils/grid-utils.mjs";
import { drawDashedPath } from "../utils/pixi-utils.mjs";
import { getTerrainColor, getTerrainTypeMap } from "../utils/terrain-types.mjs";

/**
 * @typedef {Object} Point3D
 * @property {number} x
 * @property {number} y
 * @property {number} h
 */

const rulerLineWidth = 4;
const heightIndicatorXOffset = 10;
const getHeightIndicatorLabel = (/** @type {number} */ h) => `H${h}`;

export class LineOfSightRulerLayer extends CanvasLayer {

	// Track the start and end heights separately so that when the user is using it, it remembers their start and end
	// values allowing them to quickly repeat the same measurement at the same height.
	/** @type {number} */
	#cursorStartHeight = 1;

	// If the end height is undefined, then it should use the start height value. Only if the user explicitly changes the
	// height of the end of the ruler should this become non-undefined.
	/** @type {number | undefined} */
	#_cursorEndHeight = undefined;

	/** @type {Point3D | undefined} */
	#dragStartPoint = undefined;

	/** @type {Point3D | undefined} */
	#dragEndPoint = undefined;

	/** @type {Map<string, LineOfSightRuler>} */
	#rulers = new Map();

	/** @type {PreciseText} */
	#heightIndicator = undefined;

	constructor() {
		super();
		this.eventMode = "static";
	}

	/** @override */
	static get layerOptions() {
		return mergeObject(super.layerOptions, {
			zIndex: 300
		});
	}

	get isToolSelected() {
		return game.activeTool === tools.lineOfSight;
	}

	get #cursorEndHeight() {
		return this.#_cursorEndHeight ?? this.#cursorStartHeight;
	}

	/** @override */
	async _draw() {
		this.hitArea = canvas.dimensions.rect;

		if (game.canvas.grid?.type !== CONST.GRID_TYPES.GRIDLESS) {
			this.#setupEventListeners("on");

			this.#heightIndicator = new PreciseText("", CONFIG.canvasTextStyle);
			this.#heightIndicator.anchor.set(0, 0.5);
			this.#heightIndicator.visible = false;
			this.addChild(this.#heightIndicator);
		}
	}

	/** @override */
	async _tearDown() {
		await super._tearDown();
		this.#setupEventListeners("off");
		this.#rulers.clear();
		this.removeChild(this.#heightIndicator);
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
			ruler = new LineOfSightRuler();
			this.addChild(ruler);
			this.#rulers.set(userId, ruler);
		}

		ruler.setEndpoints(p1, p2);
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

	// ----------------------------- //
	// Mouse/keyboard event handling //
	// ----------------------------- //
	/** @param {"on" | "off"} action */
	#setupEventListeners(action) {
		this[action]("pointerdown", this.#onMouseDown);
		this[action]("pointermove", this.#onMouseMove);
		this[action]("pointerup", this.#onMouseUp);
	}

	#onMouseDown = event => {
		if (!this.isToolSelected || event.button !== 0) return;

		const [x, y] = this.#getDragPosition(event);
		this.#dragStartPoint = { x, y, h: this.#cursorStartHeight };
		this.#dragEndPoint = { ...this.#dragStartPoint };
	};

	#onMouseMove = event => {
		// Update height indicator visibility
		// TODO: can this be moved to a hook?
		this.#heightIndicator.visible = this.isToolSelected && !this.#dragStartPoint;

		if (this.#heightIndicator.visible) {
			// Position the height indicator and update the text
			/** @type {{ x: number; y: number }} */
			const { x, y } = this.toLocal(event.data.global);
			this.#heightIndicator.position.set(x + heightIndicatorXOffset, y);
			this.#heightIndicator.text = getHeightIndicatorLabel(this.#cursorStartHeight);
		}

		if (!this.#dragStartPoint) return;

		// If dragging a measurement, use the snapped x and y position of the mouse cursor
		const [xSnapped, ySnapped] = this.#getDragPosition(event);
		this.#dragEndPoint = { x: xSnapped, y: ySnapped, h: this.#cursorEndHeight };
		this._drawLineOfSightRay(this.#dragStartPoint, this.#dragEndPoint);
	};

	#onMouseUp = event => {
		if (!this.#dragStartPoint || event.button !== 0) return;

		this.#dragStartPoint = this.#dragEndPoint = undefined;
		this._clearLineOfSightRay();
	};

	/** @returns {[number, number]} */
	#getDragPosition(event) {
		/** @type {{ x: number; y: number }} */
		const { x, y } = this.toLocal(event.data.global);

		// Holding shift disabling snapping
		const snap = !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
		if (!snap) return [x, y];

		// Otherwise, snap to nearest cell center OR cell corner (whichever is closer):

		// Work out the center of the hovered cell and the points of the hex/square around the cell
		const [row, col] = game.canvas.grid.grid.getGridPositionFromPixels(x, y);

		const snapPoints = [
			getGridCenter(row, col),
			...getGridCellPolygon(row, col)
		];

		// Of all these points, find the one closest to the mouse
		const nearestSnapPoint = snapPoints
			.map(({ x: x2, y: y2 }) => [x2, y2, Math.pow(x2 - x, 2) + Math.pow(y2 - y, 2)])
			.sort((a, b) => a[2] - b[2])[0];

		return [nearestSnapPoint[0], nearestSnapPoint[1]];
	}

	/** @param {number} delta  */
	_handleHeightChangeKeybinding(delta) {
		if (!this.isToolSelected) return;

		// When increasing or decreasing the height, snap to the nearest whole number.
		// Special case: we also want to snap to 0.5 height.
		// E.G. if height = 0, and we incease it should go to 0.5, then 1, then 2 etc.
		// TODO: do we want to allow the snapping values to be configurable?
		const change = (/** @type {number} */ current) => {
			if (delta < 0 && current > 0.5 && current <= 1)
				return 0.5;

			if (delta > 0 && current >= 0 && current < 0.5)
				return 0.5;

			if (current % 1 === 0)
				return Math.max(current + Math.sign(delta), 0);

			return delta < 0 ? Math.floor(current) : Math.ceil(current);
		};

		// If there is dragEndPoint defined, then we want to change the end height and re-draw the ruler.
		// Otherwise, just change the start height, no re-draw required.
		if (this.#dragEndPoint) {
			this.#_cursorEndHeight = change(this.#cursorEndHeight);
			this.#dragEndPoint.h = this.#cursorEndHeight;
			this._drawLineOfSightRay(this.#dragStartPoint, this.#dragEndPoint);
		} else {
			this.#cursorStartHeight = change(this.#cursorStartHeight);
			this.#heightIndicator.text = getHeightIndicatorLabel(this.#cursorStartHeight);
		}
	}
}

class LineOfSightRuler extends PIXI.Container {

	/** @type {Point3D | undefined} */
	#p1;

	/** @type {Point3D | undefined} */
	#p2;

	/** @type {ReturnType<typeof HeightMap.flattenLineOfSightIntersectionRegions>} */
	#intersectionRegions = [];

	constructor() {
		super();

		/** @type {PIXI.Graphics} */
		this.line = this.addChild(new PIXI.Graphics());

		/** @type {PreciseText} */
		this.startHeightLabel = this.addChild(new PreciseText("", CONFIG.canvasTextStyle));
		this.startHeightLabel.anchor.set(0, 0.5);

		/** @type {PreciseText} */
		this.endHeightLabel = this.addChild(new PreciseText("", CONFIG.canvasTextStyle));
		this.endHeightLabel.anchor.set(0, 0.5);
	}

	/**
	 * @param {Point3D} p1
	 * @param {Point3D} p2
	 */
	setEndpoints(p1, p2) {
		// If the points haven't actually changed, don't need to do any recalculations/redraws
		let hasChanged = false;

		if (p1.x !== this.#p1?.x || p1.y !== this.#p1?.y || p1.h !== this.#p1?.h) {
			this.#p1 = { ...p1 };
			hasChanged = true;
		}

		if (p2.x !== this.#p2?.x || p2.y !== this.#p2?.y || p2.h !== this.#p2?.h) {
			this.#p2 = { ...p2 };
			hasChanged = true;
		}

		if (hasChanged) {
			this._recalculateLos();
			this._draw();
		}
	}

	_recalculateLos() {
		/** @type {import("../geometry/height-map.mjs").HeightMap} */
		const hm = game.canvas.terrainHeightLayer._heightMap;
		const intersectionRegions = hm.calculateLineOfSight(this.#p1, this.#p2);
		this.#intersectionRegions = HeightMap.flattenLineOfSightIntersectionRegions(intersectionRegions);
	}

	_draw() {
		this.line.clear();

		const terrainTypes = getTerrainTypeMap();

		// Draw the line
		let { h: _, ...lastPosition } = this.#p1;
		for (const region of this.#intersectionRegions) {

			// If there is a gap between this region's start and the previous region's end (or the start of the ray if
			// this is the first region), draw a default ruler line.
			if (lastPosition.x !== region.start.x || lastPosition.y !== region.start.y) {
				this.line.lineStyle({ color: 0xFFFFFF, width: rulerLineWidth });
				this.line.moveTo(lastPosition.x, lastPosition.y);
				this.line.lineTo(region.start.x, region.start.y);
			}

			// Draw the intersection region (in the color of the intersected terrain)
			const terrainColor = getTerrainColor(terrainTypes.get(region.terrainTypeId) ?? {});
			this.line.lineStyle({ color: terrainColor, width: rulerLineWidth });
			if (region.skimmed) {
				this.line.moveTo(region.start.x, region.start.y);
				this.line.lineTo(region.end.x, region.end.y);
			} else {
				drawDashedPath(this.line, [region.start, region.end], { dashSize: 4 });
			}
			lastPosition = region.end;
		}

		// If there is a gap between the last region's end point (or the start of the ray if there are no regions) and
		// the end point of the ray, draw a default line between these two points
		if (lastPosition.x !== this.#p2.x || lastPosition.y !== this.#p2.y) {
			this.line.lineStyle({ color: 0xFFFFFF, width: rulerLineWidth });
			this.line.moveTo(lastPosition.x, lastPosition.y);
			this.line.lineTo(this.#p2.x, this.#p2.y);
		}

		// Update the labels for the height
		this.startHeightLabel.text = getHeightIndicatorLabel(this.#p1.h);
		this.startHeightLabel.position.set(this.#p1.x + heightIndicatorXOffset, this.#p1.y);

		this.endHeightLabel.text = getHeightIndicatorLabel(this.#p2.h);
		this.endHeightLabel.position.set(this.#p2.x + heightIndicatorXOffset, this.#p2.y);
	}
}
