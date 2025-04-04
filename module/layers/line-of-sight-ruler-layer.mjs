import { sceneControls } from "../config/controls.mjs";
import { moduleName, settings, socketFuncs, socketName, tools } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { includeNoHeightTerrain$, lineOfSightRulerConfig$, tokenLineOfSightConfig$ } from "../stores/line-of-sight.mjs";
import { getGridCellPolygon, getGridCenter, toSceneUnits } from "../utils/grid-utils.mjs";
import { isPoint3d, prettyFraction } from "../utils/misc-utils.mjs";
import { drawDashedPath } from "../utils/pixi-utils.mjs";
import { fromHook, join } from "../utils/signal.mjs";
import { getTerrainColor, getTerrainTypeMap } from "../utils/terrain-types.mjs";
import { calculateRaysBetweenTokensOrPoints } from "../utils/token-utils.mjs";
import { TerrainHeightLayer } from "./terrain-height-layer.mjs";

/**
 * @typedef {Object} Point3D
 * @property {number} x
 * @property {number} y
 * @property {number} h
 */

/**
 * @typedef {Object} LineOfSightRulerConfiguration
 * @property {Point3D | Token | string} a Either absolute XYH coordinates, a token, or a token ID.
 * @property {Point3D | Token | string} b Either absolute XYH coordinates, a token, or a token ID.
 * @property {number} [ah] When `a` is a token, the relative height of the ray in respect to that token.
 * @property {number} [bh] When `b` is a token, the relative height of the ray in respect to that token.
 * @property {boolean} [includeEdges] If at least either first or second are tokens, then this indicates whether to only
 * draw centre-to-centre rulers (false) or include both edge-to-edge rulers also (true). Defaults to true.
 * @property {boolean} [includeNoHeightTerrain]
 * @property {boolean} [showLabels]
 */

const rulerLineWidth = 4;
const heightIndicatorXOffset = 10;

// How often rulers should refresh in milliseconds. Set to 15fps.
const rulerRefreshTimeout = 1000 / 15;

export class LineOfSightRulerLayer extends CanvasLayer {

	/**
	 * Map of users and groups to their rulers.
	 * @type {Map<string, LineOfSightRulerGroup>}
	 */
	#rulerGroups = new Map();

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
					this._drawLineOfSightRays([{ a: { ...p1, h: h1 }, b: { ...p2, h: h2 ?? h1 }, includeNoHeightTerrain }], { drawForOthers: true });
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
					this._drawLineOfSightRays([
						{ a: token1, ah: h1, b: token2, bh: h2, includeNoHeightTerrain }
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
			if (this.#lineStartIndicator) {
				this.#lineStartIndicator.visible = this.isToolSelected && !rulerStartPoint;
			}
		}, lineOfSightRulerConfig$.p1$, sceneControls.activeControl$, sceneControls.activeTool$);
	}

	/** @return {LineOfSightRulerLayer | undefined} */
	static get current() {
		return canvas.terrainHeightLosRulerLayer;
	}

	get isToolSelected() {
		return game.activeTool === tools.lineOfSight;
	}

	get #isDraggingRuler() {
		return lineOfSightRulerConfig$.p1$.value !== undefined;
	}

	/** @override */
	async _draw() {
		if (canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS) return;

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
		this.#clearAllCurrentUserRulers();

		this.removeChild(this.#lineStartIndicator);
	}

	// ----------------------- //
	// Calculation & rendering //
	// ----------------------- //
	/**
	 * Draws one or more line of sight rulers on the map, from the given start and end points and the given intersection
	 * regions.
	 * @param {LineOfSightRulerConfiguration[]} rulers The rulers to draw to the canvas. Each pair is the start and
	 * end points and an optional configuration object.
	 * @param {Object} [options]
	 * @param {string} [options.group] The name of the group to draw these rulers in.
	 * @param {string} [options.userId] ID of the user that is drawing the LOS ruler. Defaults to current user.
	 * @param {string} [options.sceneId] ID of the scene that the ruler is being drawn on. Defaults to current scene. If
	 * provided and not equal to the current scene, then the ruler is not drawn.
	 * @param {boolean} [options.drawForOthers] If true, this ruler will be drawn on other user's canvases.
	 */
	_drawLineOfSightRays(rulers, { group = "default", userId = undefined, sceneId = undefined, drawForOthers = true } = {}) {
		userId ??= game.userId;
		sceneId ??= canvas.scene.id;

		// Occurs when a user draws a ruler on a different scene
		if (sceneId !== canvas.scene.id) return;

		// Get the ruler array
		const mapKey = this.#getRulerGroupMapKey(userId, group);
		let rulerGroup = this.#rulerGroups.get(mapKey);
		if (!rulerGroup) {
			rulerGroup = new LineOfSightRulerGroup(Color.from(game.users.get(userId).color));
			this.addChild(rulerGroup);
			this.#rulerGroups.set(mapKey, rulerGroup);
		}

		// Update the rulers, converting token IDs into tokens
		rulerGroup._updateConfig(rulers.map(r => ({
			...r,
			a: typeof r.a === "string" ? canvas.tokens.get(r.a) : r.a,
			b: typeof r.b === "string" ? canvas.tokens.get(r.b) : r.b,
		})));

		// Draw for other players
		if (drawForOthers && userId === game.userId && this.#shouldShowUsersRuler) {
			game.socket.emit(socketName, {
				func: socketFuncs.drawLineOfSightRay,
				args: [
					// change tokens into token ids to be serialized
					rulers.map(r => ({ ...r, a: r.a instanceof Token ? r.a.id : r.a, b: r.b instanceof Token ? r.b.id : r.b })),
					{ group, userId, sceneId, drawForOthers: false }
				]
			});
		}
	}

	/**
	 * Removes all line of sight rulers for the given user (or current user if userId is not provided).
	 * @param {Object} [options]
	 * @param {string} [options.group] The name of the group to clear these rulers from.
	 * @param {string} [options.userId] The ID of the user whose LOS ruler to remove. Defaults to current user.
	 * @param {boolean} [options.clearForOthers] If true, this user's ruler will be cleared on other user's canvases.
	 */
	_clearLineOfSightRays({ group = "default", userId = undefined, clearForOthers = true } = {}) {
		userId ??= game.userId;

		const mapKey = this.#getRulerGroupMapKey(userId, group);
		const rulerGroup = this.#rulerGroups.get(mapKey);
		if (rulerGroup) {
			this.removeChild(rulerGroup);
			this.#rulerGroups.delete(mapKey);
		}

		if (clearForOthers && userId === game.userId && this.#shouldShowUsersRuler) {
			game.socket.emit(socketName, {
				func: socketFuncs.clearLineOfSightRay,
				args: [{ group, userId: game.userId, clearForOthers: false }]
			});
		}
	}

	#clearAllCurrentUserRulers() {
		this.#rulerGroups.forEach(group => this.removeChild(group));
		this.#rulerGroups.clear();

		lineOfSightRulerConfig$.value = {
			p1: undefined,
			p2: undefined
		};

		tokenLineOfSightConfig$.value = {
			token1: undefined,
			token2: undefined
		};
	}

	/**
	 * Whether the current user's ruler should be shown to other users.
	 * @return {boolean}
	 */
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

	/**
	 * Gets the key to use in the `#rulerGroups` map.
	 * @param {string} userId
	 * @param {string} groupName
	 */
	#getRulerGroupMapKey(userId, groupName) {
		return `${userId}|${groupName}`;
	}

	/**
	 * When a token is refreshed, pass that along to any groups.
	 * If a token is being tracked for a ruler, that ruler will be re-drawn.
	 */
	_onTokenRefresh(token) {
		for (const group of this.#rulerGroups.values()) {
			group._onTokenRefresh(token);
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
		const { i, j } = canvas.grid.getOffset({ x, y });

		const snapPoints = [
			getGridCenter(i, j),
			...getGridCellPolygon(i, j)
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
}

class LineOfSightRulerGroup extends PIXI.Container {

	/** @type {{ config: LineOfSightRulerConfiguration; rulers: LineOfSightRuler[]; }[]} */
	#rulers = [];

	#color;

	/**
	 * A list of tokens that have been refreshed since the last throttled redrawRulers call.
	 * @type {Set<Token>}
	 */
	#pendingTokenRefreshes = new Set();

	/** setTimeout handle for the _onTokenRefresh throttle. */
	#refreshTokenTimeoutHandle = -1;

	/** @param {number} color */
	constructor(color = 0xFFFFFF) {
		super();

		this.#color = color;
	}

	/**
	 * Updates the group's rulers with the new config.
	 * @param {LineOfSightRulerConfiguration[]} rulers
	 */
	_updateConfig(rulers) {
		// Validate config
		if (!Array.isArray(rulers))
			throw new Error("Expected `rulers` to be an array.");

		for (let i = 0; i < rulers.length; i++) {
			if (!(rulers[i].a instanceof Token || isPoint3d(rulers[i].a)))
				throw new Error(`\`rulers[${i}].a\` is not a Token or a Point3D (object with x, y and h numbers)`);
			if (!(rulers[i].b instanceof Token || isPoint3d(rulers[i].b)))
				throw new Error(`\`rulers[${i}].b\` is not a Token or a Point3D (object with x, y and h numbers)`);
		}

		// Update
		while (this.#rulers.length > rulers.length) {
			const removed = this.#rulers.pop();
			removed.rulers.forEach(r => this.removeChild(r));
		}

		while (this.#rulers.length < rulers.length) {
			this.#rulers.push({ config: {}, rulers: [] });
		}

		for (let i = 0; i < rulers.length; i++) {
			this.#rulers[i].config = { ...rulers[i] };
			this.#redrawRulers(this.#rulers[i]);
		}
	}

	/**
	 * Redraws the ruler(s) at the given index.
	 * @param {{ config: LineOfSightRulerConfiguration; rulers: LineOfSightRuler[]; }} args
	 */
	#redrawRulers({ config, rulers }) {
		// Work out whether we need to create/destroy any individual rulers or not
		const hasEdgeToEdge = (config.a instanceof Token || config.b instanceof Token) && config.includeEdges !== false;
		const nRulers = hasEdgeToEdge ? 3 : 1;

		while (rulers.length > nRulers)
			this.removeChild(rulers.pop());

		while (rulers.length < nRulers)
			rulers.push(this.addChild(new LineOfSightRuler(this.#color)));

		// Redraw individual rulers
		const points = calculateRaysBetweenTokensOrPoints(config.a, config.b, config.ah, config.bh);

		if (!points) return;

		rulers[0].updateRuler(points.centre[0], points.centre[1], config.includeNoHeightTerrain ?? false, true);
		if (nRulers === 3) {
			rulers[1].updateRuler(points.left[0], points.left[1], config.includeNoHeightTerrain ?? false, false);
			rulers[2].updateRuler(points.right[0], points.right[1], config.includeNoHeightTerrain ?? false, false);
		}
	}

	/**
	 * Indicates that the given token has been refreshed. If any rulers are tracking that token, they will be re-drawn.
	 * @param {Token} token
	 */
	_onTokenRefresh(token) {
		// We throttle this function so that animations/multiple moving tokens don't cause rapid updates and affect
		// performance.
		this.#pendingTokenRefreshes.add(token);

		// If -1, then there is no call queued, so create a timeout to call redrawRulersIfTokensRefreshed.
		// If not -1, then a call is already queued so don't need to do anything.
		if (this.#refreshTokenTimeoutHandle === -1) {
			this.#refreshTokenTimeoutHandle = setTimeout(() => {
				this.#redrawRulersIfTokensRefreshed();
				this.#refreshTokenTimeoutHandle = -1;
			}, rulerRefreshTimeout);
		}
	}

	/**
	 * Consumes the #pendingTokenRefreshes set, redrawing any rulers that depend on tokens in this set.
	 */
	#redrawRulersIfTokensRefreshed() {
		for (const ruler of this.#rulers) {
			if (this.#pendingTokenRefreshes.has(ruler.config.a) || this.#pendingTokenRefreshes.has(ruler.config.b)) {
				this.#redrawRulers(ruler);
			}
		}

		this.#pendingTokenRefreshes.clear();
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
	 * @param {boolean} [showLabels]
	 */
	updateRuler(p1, p2, includeNoHeightTerrain, showLabels = undefined) {
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

		if (typeof showLabels === "boolean") {
			this.showLabels = showLabels;
		}
	}

	_recalculateLos() {
		const hm = TerrainHeightLayer.current?._heightMap;
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

		const setTerrainColor = (/** @type {string} */ terrainTypeId) => {
			const terrainColor = getTerrainColor(terrainTypes.get(terrainTypeId) ?? {});
			this.#line.lineStyle({ color: terrainColor, alpha: 0.75, width: rulerLineWidth });
		};

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

			// Draw the intersection region (in the color of the intersected terrain(s))
			// - For a skim, draw a solid line. We just pick the first terrain ID returned for the color, because using
			//   multiple colours makes it look like a full intersection.
			// - For intersecting multiple sections, we alternate the coloured dots for each type of terrain.
			if (region.skimmed) {
				setTerrainColor(region.shapes[0].terrainTypeId);
				this.#line.moveTo(region.start.x, region.start.y).lineTo(region.end.x, region.end.y);
			} else {
				const dashSize = 4;
				const gapSize = dashSize * 2 * region.shapes.length - dashSize; // gap size needs to account for the other terrain's dots
				for (let i = 0; i < region.shapes.length; i++) {
					setTerrainColor(region.shapes[i].terrainTypeId);
					drawDashedPath(this.#line, [region.start, region.end], { dashSize, gapSize, offset: dashSize * 2 * i });
				}
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
