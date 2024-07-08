import { moduleName, settings, socketlibFuncs, tools } from "../consts.mjs";
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

	/** @type {LineOfSightRulerLineCap} */
	#lineStartIndicator = undefined;

	constructor() {
		super();
		this.eventMode = "static";

		// Ensure rulers are deleted when a user quits
		Hooks.on("userConnected", (user, _connected) => this._clearLineOfSightRay({ userId: user.id, clearForOthers: false }));
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

			this.#lineStartIndicator = this.addChild(new LineOfSightRulerLineCap(Color.from(game.user.color)));
			this.#lineStartIndicator.visible = false;
		}
	}

	/** @override */
	async _tearDown() {
		await super._tearDown();
		this.#setupEventListeners("off");
		this.#rulers.clear();
		this.removeChild(this.#lineStartIndicator);
	}

	// ----------------------- //
	// Calculation & rendering //
	// ----------------------- //
	/**
	 * Draws a line of sight ruler on the map, from the given start and end points and the given intersection regions.
	 * @param {Point3D} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {Point3D} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {Object} [options]
	 * @param {string} [options.userId] ID of the user that is drawing the LOS ruler. Defaults to current user.
	 * @param {boolean} [options.drawForOthers] If true, this ruler will be drawn on other user's canvases.
	 */
	_drawLineOfSightRay(p1, p2, { userId = undefined, drawForOthers = true } = {}) {
		userId ??= game.userId;

		let ruler = this.#rulers.get(userId);
		if (!ruler) {
			ruler = new LineOfSightRuler(Color.from(game.users.get(userId).color));
			this.addChild(ruler);
			this.#rulers.set(userId, ruler);
		}

		ruler.setEndpoints(p1, p2);

		if (drawForOthers && userId === game.userId && this.#shouldShowUsersRuler) {
			globalThis.terrainHeightTools.socket?.executeForOthers(
				socketlibFuncs.drawLineOfSightRay,
				this.#dragStartPoint, this.#dragEndPoint,
				{ userId: game.userId, drawForOthers: false });
		}
	}

	/**
	 * Removes a line of sight
	 * @param {Object} [options]
	 * @param {string} [options.userId] The ID of the user whose LOS ruler to remove. Defaults to current user.
	 * @param {boolean} [options.clearForOthers] If true, this user's ruler will be cleared on other user's canvases.
	 */
	_clearLineOfSightRay({ userId = undefined, clearForOthers = true } = {}) {
		userId ??= game.userId;

		const ruler = this.#rulers.get(userId);
		if (ruler) {
			this.removeChild(ruler);
			this.#rulers.delete(userId);
		}

		if (clearForOthers && userId === game.userId && this.#shouldShowUsersRuler) {
			globalThis.terrainHeightTools.socket?.executeForOthers(
				socketlibFuncs.clearLineOfSightRay,
				{ userId: game.userId, clearForOthers: false });
		}
	}

	get #shouldShowUsersRuler() {
		return game.settings.get(moduleName, game.user.isGM ? settings.displayLosMeasurementGm : settings.displayLosMeasurementPlayer);
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
		this.#lineStartIndicator.visible = this.isToolSelected && !this.#dragStartPoint;

		// Get the drag position, which may include snapping
		const [x, y] = this.#getDragPosition(event);

		// Position the height indicator and update the text if it's visible
		if (this.#lineStartIndicator.visible) {
			this.#lineStartIndicator.position.set(x, y);
			this.#lineStartIndicator.height = this.#cursorStartHeight;
		}

		// If the user has started dragging a measurement, update the endpoint
		if (this.#dragStartPoint && (this.#dragEndPoint.x !== x || this.#dragEndPoint.y !== y || this.#dragEndPoint.h !== this.#cursorEndHeight)) {
			this.#dragEndPoint = { x, y, h: this.#cursorEndHeight };
			this._drawLineOfSightRay(this.#dragStartPoint, this.#dragEndPoint);
		}
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
			this.#lineStartIndicator.height = this.#cursorStartHeight;
		}
	}
}

class LineOfSightRulerLineCap extends PIXI.Container {

	/** @type {PreciseText} */
	#text;

	/** @param {number} color */
	constructor(color = 0xFFFFFF) {
		super();

		this.#text = this.addChild(new PreciseText("", CONFIG.canvasTextStyle.clone()));
		this.#text.anchor.set(0, 0.5);
		this.#text.position.set(heightIndicatorXOffset, 0);
		this.#text.style.fill = color;

		this.addChild(new PIXI.Graphics())
			.beginFill(color, 0.5)
			.lineStyle({ color: 0x000000, alpha: 0.25, width: 2 })
			.drawCircle(0, 0, 6);
	}

	/** @param {number} value */
	set height(value) {
		this.#text.text = `H${value}`;
	}
}

class LineOfSightRuler extends PIXI.Container {

	/** @type {Point3D | undefined} */
	#p1;

	/** @type {Point3D | undefined} */
	#p2;

	/** @type {ReturnType<typeof HeightMap.flattenLineOfSightIntersectionRegions>} */
	#intersectionRegions = [];

	/** @type {PIXI.Graphics} */
	#line;

	/** @type {LineOfSightRulerLineCap} */
	#startCap;

	/** @type {LineOfSightRulerLineCap} */
	#endCap;

	/** @param {number} color */
	constructor(color = 0xFFFFFF) {
		super();

		this.#line = this.addChild(new PIXI.Graphics());
		this.#startCap = this.addChild(new LineOfSightRulerLineCap(color));
		this.#endCap = this.addChild(new LineOfSightRulerLineCap(color));
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
		this.#line.clear();

		const terrainTypes = getTerrainTypeMap();

		// Draw the line's shadow
		this.#line.lineStyle({ color: 0x000000, alpha: 0.5, width: rulerLineWidth + 2 })
			.moveTo(this.#p1.x, this.#p1.y)
			.lineTo(this.#p2.x, this.#p2.y);

		// Draw the line
		let { h: _, ...lastPosition } = this.#p1;
		for (const region of this.#intersectionRegions) {

			// If there is a gap between this region's start and the previous region's end (or the start of the ray if
			// this is the first region), draw a default ruler line.
			if (lastPosition.x !== region.start.x || lastPosition.y !== region.start.y) {
				this.#line.lineStyle({ color: 0xFFFFFF, alpha: 0.75, width: rulerLineWidth })
					.moveTo(lastPosition.x, lastPosition.y)
					.lineTo(region.start.x, region.start.y);
			}

			// Draw the intersection region (in the color of the intersected terrain)
			const terrainColor = getTerrainColor(terrainTypes.get(region.terrainTypeId) ?? {});
			this.#line.lineStyle({ color: terrainColor, alpha: 0.75, width: rulerLineWidth });
			if (region.skimmed) {
				this.#line.moveTo(region.start.x, region.start.y).lineTo(region.end.x, region.end.y);
			} else {
				drawDashedPath(this.#line, [region.start, region.end], { dashSize: 4 });
			}
			lastPosition = region.end;
		}

		// If there is a gap between the last region's end point (or the start of the ray if there are no regions) and
		// the end point of the ray, draw a default line between these two points
		if (lastPosition.x !== this.#p2.x || lastPosition.y !== this.#p2.y) {
			this.#line.lineStyle({ color: 0xFFFFFF, alpha: 0.75, width: rulerLineWidth })
				.moveTo(lastPosition.x, lastPosition.y)
				.lineTo(this.#p2.x, this.#p2.y);
		}

		// Update the labels for the height
		this.#startCap.height = this.#p1.h;
		this.#startCap.position.set(this.#p1.x, this.#p1.y);

		this.#endCap.height = this.#p2.h;
		this.#endCap.position.set(this.#p2.x, this.#p2.y);
	}
}
