import { sceneControls } from "../config/controls.mjs";
import { moduleName, settings, socketFuncs, socketName, tools } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { LineSegment } from "../geometry/line-segment.mjs";
import { Polygon } from "../geometry/polygon.mjs";
import { includeNoHeightTerrain$, lineOfSightRulerConfig$, tokenLineOfSightConfig$ } from "../stores/line-of-sight.mjs";
import { getGridCellPolygon, getGridCenter, getGridVerticesFromToken, toSceneUnits } from "../utils/grid-utils.mjs";
import { prettyFraction } from "../utils/misc-utils.mjs";
import { drawDashedPath } from "../utils/pixi-utils.mjs";
import { fromHook, join } from "../utils/signal.mjs";
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

	/** @type {Map<string, LineOfSightRuler[]>} */
	#rulers = new Map();

	/** @type {LineOfSightRulerLineCap} */
	#lineStartIndicator = undefined;

	constructor() {
		super();
		this.eventMode = "static";

		tokenLineOfSightConfig$.value = {
			h1: game.settings.get(moduleName, settings.defaultTokenLosTokenHeight),
			h2: game.settings.get(moduleName, settings.defaultTokenLosTokenHeight)
		};

		// Ensure rulers are deleted when a user quits
		Hooks.on("userConnected", (user, _connected) => this._clearLineOfSightRays({ userId: user.id, clearForOthers: false }));

		// When any of the drag values are changed, update the ruler
		join(({ p1, h1, p2, h2 }, includeNoHeightTerrain) => {
				if (p1 && p2)
					this._drawLineOfSightRays([[{ ...p1, h: h1 }, { ...p2, h: h2 ?? h1 }, { includeNoHeightTerrain }]], { drawForOthers: true });
				else
					this._clearLineOfSightRays({ clearForOthers: true });
			},
			lineOfSightRulerConfig$,
			includeNoHeightTerrain$);

		// When the start height is changed, update the ghost indicator
		lineOfSightRulerConfig$.h1$.subscribe(v => {
			if (this.#lineStartIndicator)
				this.#lineStartIndicator.height = v;
		});

		// When either of the selected tokens for the token LOS are changed, update the token LOS rulers.
		join(({ token1, token2, h1, h2 }, includeNoHeightTerrain, _) => {
				if (token1 && token2) {
					const [leftRay, centreRay, rightRay] = LineOfSightRulerLayer._calculateRaysBetweenTokens(token1, token2, h1, h2);
					this._drawLineOfSightRays([
						[...leftRay, { includeNoHeightTerrain, showLabels: false }],
						[...centreRay, { includeNoHeightTerrain, showLabels: true }],
						[...rightRay, { includeNoHeightTerrain, showLabels: false }],
					]);
				} else {
					this._clearLineOfSightRays();
				}
			},
			tokenLineOfSightConfig$,
			includeNoHeightTerrain$,
			fromHook("updateToken", t => tokenLineOfSightConfig$.token1$.value?.id === t.id || tokenLineOfSightConfig$.token2$.value?.id === t.id)
		);

		// Only enable events when the ruler layer is active, otherwise it interferes with other standard layers
		join((activeControl, activeTool) => {
			this.eventMode = activeControl === "token" && activeTool === tools.lineOfSight ? "static" : "none";
		}, sceneControls.activeControl$, sceneControls.activeTool$);

		// Only show the height indicator when the tool is active AND the user has not begun dragging a ruler out
		join((rulerStartPoint) => {
			this.#lineStartIndicator.visible = this.isToolSelected && !rulerStartPoint;
		}, lineOfSightRulerConfig$.p1$, sceneControls.activeControl$, sceneControls.activeTool$);
	}

	get isToolSelected() {
		return game.activeTool === tools.lineOfSight;
	}

	get #isDraggingRuler() {
		return lineOfSightRulerConfig$.p1$.value !== undefined;
	}

	/** @override */
	async _draw() {
		if (game.canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS) return;

		this.hitArea = canvas.dimensions.rect;
		this.zIndex = 900; // Above token layer, below control layers

		this.#setupEventListeners("on");

		this.#lineStartIndicator = this.addChild(new LineOfSightRulerLineCap(Color.from(game.user.color)));
		this.#lineStartIndicator.height = lineOfSightRulerConfig$.h1$.value;
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
		// Validate `ruler` param type
		if (!Array.isArray(rulers)) throw new Error("`rulers` was not an array.");
		for (let i = 0; i < rulers.length; i++) {
			if (!LineOfSightRulerLayer._isPoint3d(rulers[i][0]))
				throw new Error(`\`rulers[${i}][0]\` is not a Point3D (object with x, y and h numbers)`);
			if (!LineOfSightRulerLayer._isPoint3d(rulers[i][1]))
				throw new Error(`\`rulers[${i}][1]\` is not a Point3D (object with x, y and h numbers)`);
		}

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
			userRulers[i].alpha = userId === game.userId ? 1 : game.settings.get(moduleName, settings.otherUserLineOfSightRulerOpacity);
		}

		// Draw for other players
		if (drawForOthers && userId === game.userId && this.#shouldShowUsersRuler) {
			game.socket.emit(socketName, {
				func: socketFuncs.drawLineOfSightRay,
				args: [rulers, { userId, sceneId, drawForOthers: false }]
			});
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
			game.socket.emit(socketName, {
				func: socketFuncs.clearLineOfSightRay,
				args: [{ userId: game.userId, clearForOthers: false }]
			});
		}
	}

	/**
	 * Given two tokens, calculates the centre-to-centre ray, and the two edge-to-edge rays for them.
	 * @param {Token} token1
	 * @param {Token} token2
	 * @param {number} token1RelativeHeight A number between 0-1 inclusive that specifies how far vertically relative to
	 * token1 the ray should spawn from.
	 * @param {number} token2RelativeHeight A number between 0-1 inclusive that specifies how far vertically relative to
	 * token2 the ray should end at.
	 * @returns {[Point3D, Point3D][]}
	 */
	static _calculateRaysBetweenTokens(token1, token2, token1RelativeHeight = 1, token2RelativeHeight = 1) {
		if (!(token1 instanceof Token)) throw new Error("`token1` is not a Foundry Token");
		if (!(token2 instanceof Token)) throw new Error("`token2` is not a Foundry Token");
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
		const token1Height = token1Doc.elevation + token1Doc.width * token1RelativeHeight;
		const token2Doc = token2 instanceof Token ? token2.document : token2;
		const token2Height = token2Doc.elevation + token2Doc.width * token2RelativeHeight;

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

		lineOfSightRulerConfig$.value = {
			p1: undefined,
			p2: undefined
		};

		tokenLineOfSightConfig$.value = {
			token1: undefined,
			token2: undefined
		};
	}

	get #shouldShowUsersRuler() {
		return game.settings.get(moduleName, game.user.isGM ? settings.displayLosMeasurementGm : settings.displayLosMeasurementPlayer);
	}

	/** Attempts to populate the token1 and token2 values based on the user's selected/targetted tokens. */
	_autoSelectTokenLosTargets() {
		// For the primary token, prefer the selected token, falling back to the user's configured character token
		if (game.settings.get(moduleName, settings.tokenLosToolPreselectToken1)) {
			let token = canvas.tokens.controlled?.[0] ?? game.user.character?.getActiveTokens()?.[0];

			// Special case for LANCER: If the user's active character is a pilot, get their active mech's active tokens
			if (!token && game.system.id === "lancer" && game.user.character?.type === "pilot")
				token = game.user.character.system.active_mech?.value?.getActiveTokens()?.[0];

			if (token)
				tokenLineOfSightConfig$.token1$.value = token;
		}

		// For the secondary token, prefer the targeted token
		if (game.settings.get(moduleName, settings.tokenLosToolPreselectToken2)) {
			const token = game.user.targets.first();

			if (token && tokenLineOfSightConfig$.token1$.value !== token) // do not allow same token as primary token (e.g. if user targets own token)
				tokenLineOfSightConfig$.token2$.value = token;
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
		lineOfSightRulerConfig$.value = {
			p1: { x, y },
			p2: { x, y }
		};
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
		if (this.#isDraggingRuler && (lineOfSightRulerConfig$.p2$.value.x !== x || lineOfSightRulerConfig$.p2$.value.y !== y)) {
			lineOfSightRulerConfig$.p2$.value = { x, y };
		}
	};

	#onMouseUp = event => {
		if (!this.isToolSelected || !this.#isDraggingRuler || event.button !== 0) return;

		lineOfSightRulerConfig$.value = {
			p1: undefined,
			p2: undefined
		};
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
			lineOfSightRulerConfig$.h2$.value = change(lineOfSightRulerConfig$.h2$.value ?? lineOfSightRulerConfig$.h1$.value);
		} else {
			lineOfSightRulerConfig$.h1$.value = change(lineOfSightRulerConfig$.h1$.value);
		}
	}

	// ---- //
	// Util //
	// ---- //
	/**
	 * @param {*} obj
	 * @returns {obj is Point3D}
	 */
	static _isPoint3d(obj) {
		return typeof obj === "object"
			&& typeof obj.x === "number"
			&& typeof obj.y === "number"
			&& typeof obj.h === "number";
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
		this.#text.text = `H${prettyFraction(toSceneUnits(value))}`;
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
