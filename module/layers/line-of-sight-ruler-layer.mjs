import { sceneControls } from "../config/controls.mjs";
import { moduleName, settings, socketlibFuncs, tools } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { LineSegment } from "../geometry/line-segment.mjs";
import { Polygon } from "../geometry/polygon.mjs";
import { getGridCellPolygon, getGridCenter, getGridVerticesFromToken } from "../utils/grid-utils.mjs";
import { drawDashedPath } from "../utils/pixi-utils.mjs";
import { Signal } from "../utils/signal.mjs";
import { getTerrainColor, getTerrainTypeMap } from "../utils/terrain-types.mjs";

/**
 * @typedef {Object} Point3D
 * @property {number} x
 * @property {number} y
 * @property {number} h
 */

/**
 * @typedef {Object} RulerOptions
 * @property {boolean} [includeNoHeightTerrain]
 * @property {boolean} [showLabels]
 */

const rulerLineWidth = 4;
const heightIndicatorXOffset = 10;

export class LineOfSightRulerLayer extends CanvasLayer {

	// Track the start and end heights separately so that when the user is using it, it remembers their start and end
	// values allowing them to quickly repeat the same measurement at the same height.

	/** @type {Signal<{ x: number; y: number; } | undefined>} */
	_rulerStartPoint$ = new Signal(undefined);

	/** @type {Signal<number>} */
	_rulerStartHeight$ = new Signal(1);

	/** @type {Signal<{ x: number; y: number; } | undefined>} */
	_rulerEndPoint$ = new Signal(undefined);

	// If `undefined`, then should use the start height instead.
	/** @type {Signal<number | undefined>} */
	_rulerEndHeight$ = new Signal(undefined);

	/** @type {Signal<Token | undefined>} */
	_token1$ = new Signal(undefined);

	/** @type {Signal<Token | undefined>} */
	_token2$ = new Signal(undefined);

	/** @type {Signal<boolean>} */
	_rulerIncludeNoHeightTerrain$ = new Signal(false);


	/** @type {Map<string, LineOfSightRuler[]>} */
	#rulers = new Map();

	/** @type {LineOfSightRulerLineCap} */
	#lineStartIndicator = undefined;

	constructor() {
		super();
		this.eventMode = "static";

		// Ensure rulers are deleted when a user quits
		Hooks.on("userConnected", (user, _connected) => this._clearLineOfSightRays({ userId: user.id, clearForOthers: false }));

		// When any of the drag values are changed, update the ruler
		Signal.join((p1, h1, p2, h2, includeNoHeightTerrain) => {
				if (p1 && p2)
					this._drawLineOfSightRays([[{ ...p1, h: h1 }, { ...p2, h: h2 ?? h1 }]], { includeNoHeightTerrain, drawForOthers: true });
				else
					this._clearLineOfSightRays({ clearForOthers: true });
			},
			this._rulerStartPoint$,
			this._rulerStartHeight$,
			this._rulerEndPoint$,
			this._rulerEndHeight$,
			this._rulerIncludeNoHeightTerrain$);

		// When the start height is changed, update the ghost indicator
		this._rulerStartHeight$.subscribe(v => {
			if (this.#lineStartIndicator)
				this.#lineStartIndicator.height = v;
		});

		// When either of the selected tokens for the token LOS are changed, update the token LOS rulers.
		Signal.join((token1, token2, includeNoHeightTerrain, _) => {
				if (token1 && token2) {
					const [leftRay, centreRay, rightRay] = LineOfSightRulerLayer._calculateRaysBetweenTokens(token1, token2);
					this._drawLineOfSightRays([
						[...leftRay, { includeNoHeightTerrain, showLabels: false }],
						[...centreRay, { includeNoHeightTerrain, showLabels: true }],
						[...rightRay, { includeNoHeightTerrain, showLabels: false }],
					]);
				 } else {
					this._clearLineOfSightRays();
				 }
			},
			this._token1$,
			this._token2$,
			this._rulerIncludeNoHeightTerrain$,
			Signal.fromHook("updateToken", t => this._token1$.value?.id === t.id || this._token2$.value?.id === t.id)
		);

		// Only enable events when the ruler layer is active, otherwise it interferes with other standard layers
		Signal.join((activeControl, activeTool) => {
			this.eventMode = activeControl === "token" && activeTool === tools.lineOfSight ? "static" : "none";
		}, sceneControls.activeControl$, sceneControls.activeTool$);

		// Only show the height indicator when the tool is active AND the user has not begun dragging a ruler out
		Signal.join((rulerStartPoint) => {
			this.#lineStartIndicator.visible = this.isToolSelected && !rulerStartPoint;
		}, this._rulerStartPoint$, sceneControls.activeControl$, sceneControls.activeTool$);
	}

	get isToolSelected() {
		return game.activeTool === tools.lineOfSight;
	}

	get #isDraggingRuler() {
		return this._rulerStartPoint$.value !== undefined;
	}

	/** @override */
	async _draw() {
		if (game.canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS) return;

		this.hitArea = canvas.dimensions.rect;
		this.zIndex = 900; // Above token layer, below control layers

		this.#setupEventListeners("on");

		this.#lineStartIndicator = this.addChild(new LineOfSightRulerLineCap(Color.from(game.user.color)));
		this.#lineStartIndicator.height = this._rulerStartHeight$.value;
		this.#lineStartIndicator.visible = false;
	}

	/** @override */
	async _tearDown() {
		await super._tearDown();
		this.#setupEventListeners("off");

		// Ensure this user's rulers are cleared for others when this user changes scenes
		this._clearAllCurrentUserRulers();

		this.removeChild(this.#lineStartIndicator);
	}

	// ----------------------- //
	// Calculation & rendering //
	// ----------------------- //
	/**
	 * Draws one or more line of sight rulers on the map, from the given start and end points and the given intersection
	 * regions.
	 * @param {[Point3D, Point3D, RulerOptions?][]} rulers The rulers to draw to the canvas. Each pair is the start and
	 * end points and an optional configuration object.
	 * @param {Object} [options]
	 * @param {string} [options.userId] ID of the user that is drawing the LOS ruler. Defaults to current user.
	 * @param {string} [options.sceneId] ID of the scene that the ruler is being drawn on. Defaults to current scene. If
	 * provided and not equal to the current scene, then the ruler is not drawn.
	 * @param {boolean} [options.drawForOthers] If true, this ruler will be drawn on other user's canvases.
	 */
	_drawLineOfSightRays(rulers, { userId = undefined, sceneId = undefined, drawForOthers = true } = {}) {
		userId ??= game.userId;
		sceneId ??= canvas.scene.id;

		// Occurs when a user draws a ruler on a different scene
		if (sceneId !== canvas.scene.id) return;

		// Get the ruler array
		let userRulers = this.#rulers.get(userId);
		if (!userRulers) {
			this.#rulers.set(userId, userRulers = []);
		}

		// Ensure we have as many rulers as needed
		while (userRulers.length < rulers.length)
			userRulers.push(this.addChild(new LineOfSightRuler(Color.from(game.users.get(userId).color))));

		while (userRulers.length > rulers.length)
			this.removeChild(userRulers.pop());

		// Update the rulers
		for (let i = 0; i < rulers.length; i++) {
			const { includeNoHeightTerrain = false, showLabels = true } = rulers[i][2] ?? {};
			userRulers[i].updateRuler(rulers[i][0], rulers[i][1], includeNoHeightTerrain);
			userRulers[i].showLabels = showLabels;
		}

		// Draw for other players
		if (drawForOthers && userId === game.userId && this.#shouldShowUsersRuler) {
			globalThis.terrainHeightTools.socket?.executeForOthers(
				socketlibFuncs.drawLineOfSightRay,
				rulers, { userId, sceneId, drawForOthers: false });
		}
	}

	/**
	 * Removes all line of sight rulers for the given user (or current user if userId is not provided).
	 * @param {Object} [options]
	 * @param {string} [options.userId] The ID of the user whose LOS ruler to remove. Defaults to current user.
	 * @param {boolean} [options.clearForOthers] If true, this user's ruler will be cleared on other user's canvases.
	 */
	_clearLineOfSightRays({ userId = undefined, clearForOthers = true } = {}) {
		userId ??= game.userId;

		const userRulers = this.#rulers.get(userId);
		if (userRulers) {
			userRulers.forEach(ruler => this.removeChild(ruler));
			this.#rulers.delete(userId);
		}

		if (clearForOthers && userId === game.userId && this.#shouldShowUsersRuler) {
			globalThis.terrainHeightTools.socket?.executeForOthers(
				socketlibFuncs.clearLineOfSightRay,
				{ userId: game.userId, clearForOthers: false });
		}
	}

	/**
	 * Given two tokens, calculates the centre-to-centre ray, and the two edge-to-edge rays for them.
	 * @param {Token | TokenDocument} token1
	 * @param {Token | TokenDocument} token2
	 * @returns {[Point3D, Point3D][]}
	 */
	static _calculateRaysBetweenTokens(token1, token2) {
		if (token1 === token2) throw new Error("Cannot draw line of sight from a token to itself.");

		// Work out the vertices for each token
		const token1Vertices = getGridVerticesFromToken(token1);
		const token2Vertices = getGridVerticesFromToken(token2);

		// Find the midpoint of each token, and construct a ray between them
		const token1Centroid = Polygon.centroid(token1Vertices);
		const token2Centroid = Polygon.centroid(token2Vertices);
		const centreToCentreRay = new LineSegment(token1Centroid, token2Centroid);

		// For each token, find the vertex that is furtherest away from the c2c ray on either side. These will be our
		// two edge to edge rays.
		const findOuterMostPoints = (/** @type {{ x: number; y: number; }[]} */ vertices) => {
			const vertexCalculations = vertices
				.map(({ x, y }) => ({ x, y, ...centreToCentreRay.findClosestPointOnLineTo(x, y) }))
				.sort((a, b) => b.distanceSquared - a.distanceSquared);
			return [vertexCalculations.find(v => v.side === 1), vertexCalculations.find(v => v.side === -1)];
		};
		const [token1Left, token1Right] = findOuterMostPoints(token1Vertices);
		const [token2Left, token2Right] = findOuterMostPoints(token2Vertices);

		// Work out the h value for the tokens. This is how far the token is off the ground + the token's height.
		// Note that this uses the assumption that the width and height of the token is it's h value.
		const token1Doc = token1 instanceof Token ? token1.document : token1;
		const token1Height = token1Doc.elevation + token1Doc.width;
		const token2Doc = token2 instanceof Token ? token2.document : token2;
		const token2Height = token2Doc.elevation + token2Doc.width;

		return [
			[
				{ x: token1Left.x, y: token1Left.y, h: token1Height },
				{ x: token2Left.x, y: token2Left.y, h: token2Height }
			],
			[
				{ x: token1Centroid.x, y: token1Centroid.y, h: token1Height },
				{ x: token2Centroid.x, y: token2Centroid.y, h: token2Height }
			],
			[
				{ x: token1Right.x, y: token1Right.y, h: token1Height },
				{ x: token2Right.x, y: token2Right.y, h: token2Height }
			],
		];
	}

	_clearAllCurrentUserRulers() {
		this.#rulers.forEach(rulers => rulers.forEach(r => this.removeChild(r)));
		this.#rulers.clear();

		this._rulerStartPoint$.value = undefined;
		this._rulerEndPoint$.value = undefined;

		this._token1$.value = undefined;
		this._token2$.value = undefined;
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
		this._rulerStartPoint$.value = { x, y };
		this._rulerEndPoint$.value = { x, y };
	};

	#onMouseMove = event => {
		if (!this.isToolSelected) return;

		if (!this.isToolSelected) return;

		// Get the drag position, which may include snapping
		const [x, y] = this.#getDragPosition(event);

		// Position the height indicator and update the text if it's visible
		if (this.#lineStartIndicator.visible) {
			this.#lineStartIndicator.position.set(x, y);
		}

		// If the user has started dragging a measurement, update the endpoint
		if (this.#isDraggingRuler && (this._rulerEndPoint$.value.x !== x || this._rulerEndPoint$.value.y !== y)) {
			this._rulerEndPoint$.value = { x, y };
		}
	};

	#onMouseUp = event => {
		if (!this.isToolSelected || !this.#isDraggingRuler || event.button !== 0) return;

		this._rulerStartPoint$.value = this._rulerEndPoint$.value = undefined;
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

		// If the user is currently dragging the ruler, then we want to change the end height otherwise the start height
		if (this.#isDraggingRuler) {
			this._rulerEndHeight$.value = change(this._rulerEndHeight$.value ?? this._rulerStartHeight$.value);
		} else {
			this._rulerStartHeight$.value = change(this._rulerStartHeight$.value);
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

	/** @param {boolean} value */
	set showLabels(value) {
		this.#text.visible = value;
	}
}

class LineOfSightRuler extends PIXI.Container {

	/** @type {Point3D | undefined} */
	#p1;

	/** @type {Point3D | undefined} */
	#p2;

	#includeNoHeightTerrain = false;

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

	/** @param {boolean} value */
	set showLabels(value) {
		this.#startCap.showLabels = value;
		this.#endCap.showLabels = value;
	}

	/**
	 * @param {Point3D} p1
	 * @param {Point3D} p2
	 * @param {boolean} includeNoHeightTerrain
	 */
	updateRuler(p1, p2, includeNoHeightTerrain) {
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

		if (includeNoHeightTerrain !== this.#includeNoHeightTerrain) {
			this.#includeNoHeightTerrain = includeNoHeightTerrain;
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
		const intersectionRegions = hm.calculateLineOfSight(this.#p1, this.#p2, { includeNoHeightTerrain: this.#includeNoHeightTerrain });
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
