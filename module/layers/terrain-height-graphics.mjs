import { sceneControls } from "../config/controls.mjs";
import { flags, lineTypes, moduleName, settings } from "../consts.mjs";
import { LineSegment, Point, Polygon } from "../geometry/index.mjs";
import { terrainData } from "../geometry/terrain-providers.mjs";
import { chunk } from '../utils/array-utils.mjs';
import { prettyFraction } from "../utils/misc-utils.mjs";
import { drawDashedPath } from "../utils/pixi-utils.mjs";
import { Observable, Signal } from "../utils/reactive.mjs";
import { getTerrainTypes } from '../utils/terrain-types.mjs';

/**
 * The positions relative to the shape that the label placement algorithm will test, both horizontal and vertical.
 * Note that the order represents the order that ties are resolved, so in this case the middle will be prefered in ties.
 */
const labelPositionAnchors = [0.5, 0.4, 0.6, 0.2, 0.8];

/**
 * Specialised CanvasLayer for rendering HeightMapShapes to the canvas.
 */
export class TerrainHeightGraphics extends CanvasLayer {

	#ready = false;

	/** @type {import("../types").HeightMapShape[]} */
	#data = [];

	/** @type {PIXI.Graphics} */
	#graphics;

	/** @type {PIXI.Container} */
	#labels;

	/** @type {PIXI.Texture} */
	#cursorRadiusMaskTexture;

	/** @type {PIXI.Sprite} */
	#cursorRadiusMask;

	/**
	 * The purpose of this object is to get the mouse move events for moving the radius mask to work.
	 * We cannot listen to events on this object as it does not always have its events turned on.
	 * We cannot listen to canvas.stage because some parts of core Foundry functionality calls `removeAllListeners`
	 * sometimes, which then causes the events to get unbound.
	 * @type {PIXI.Container}
	*/
	#cursorRadiusMaskListenerTarget;

	#isTokenObjectsHighlighted$ = new Signal(false);

	/** @type {(() => void)[]} */
	#subscriptions = [];

	constructor() {
		super();

		this.eventMode = "static";
		this.interactive = true;

	}

	/** @override */
	async _draw() {
		this.#graphics = this.addChild(new PIXI.Graphics());
		this.#labels = this.addChild(new PIXI.Container());

		this.#cursorRadiusMaskListenerTarget = canvas.interface.addChild(new PIXI.Container());
		this.#cursorRadiusMaskListenerTarget.eventMode = "static";

		this.#ready = true;

		this.#subscriptions = [
			// Update the terrain graphics when any of the providers supply new data
			terrainData.$.subscribe(data => {
				this.#data = data;
				this.redraw();
			}, true),

			// Show/hide the graphics based on the settings and selected layers/tools
			Observable.join(
				/** @type {Signal<boolean>} */ (Signal.fromSetting(moduleName, settings.showTerrainHeightOnTokenLayer)),
				sceneControls.activeControl$
			).subscribe(([showOnTokenLayer, activeControl]) => {
				this.#setVisible(showOnTokenLayer || activeControl === moduleName);
			}, true),

			// Update the mask radius, depending on settings
			Observable.join(
				/** @type {Signal<number>} */ (Signal.fromSetting(moduleName, settings.terrainHeightLayerVisibilityRadius)),
				this.#isTokenObjectsHighlighted$,
				sceneControls.activeControl$
			).subscribe(([radius, isTokenObjectsHighlighted, activeControl]) => {
				const forceShow = isTokenObjectsHighlighted || activeControl === moduleName;
				this.#setMaskRadius(forceShow ? 0 : radius);
			}, true),

			// Redraw when settings change
			Signal.fromSetting(moduleName, settings.terrainTypes).subscribe(() => this.redraw()),
			Signal.fromSetting(moduleName, settings.useFractionsForLabels).subscribe(() => this.redraw()),
			Signal.fromSetting(moduleName, settings.smartLabelPlacement).subscribe(() => this.redraw())
		];

		Hooks.on("highlightObjects", this.#onHighlightObjects);
	}

	/** @override */
	_tearDown() {
		if (!this.#ready) return;

		this.#subscriptions.forEach(unsubscribe => unsubscribe());
		this.#subscriptions = [];
		Hooks.off("highlightObjects", this.#onHighlightObjects);

		this.#ready = false;
	}

	// Sorting within the PrimaryCanvasGroup works by the `elevation`, then by whether it is a token, then by whether it
	// is a Drawing, then finally by the `sort`.
	// Using an elevation of 0 puts it at the same level as tokens, tiles (except overhead tiles, which are 4), drawings
	// etc.
	// If the layer is to be drawn on top of tiles, use a very a high number (because the PCG explicitly checks for
	// DrawingShape and TokenMesh it will never be drawn over these regardless of the sort)
	// If the layer is to be drawn below tiles, use a very low number (but higher than -9999999999 which is for some other
	// sprite mesh) so that it is always below the tiles.
	get elevation() { return 0; }

	get sort() {
		/** @type {boolean} */
		const renderAboveTiles = canvas.scene?.getFlag(moduleName, flags.terrainLayerAboveTiles)
			?? game.settings.get(moduleName, settings.terrainLayerAboveTilesDefault);

		return renderAboveTiles ? 9999999999 : -9999999998;
	}

	/**
	 * Redraws the graphics layer.
	 */
	async redraw() {
		if (!this.#ready) return;

		// If there are no shapes on the map, just clear it and return
		if (this.#data.length === 0) {
			this._clear();
			return;
		}

		// If there are shapes on the map, load the textures (if required), then clear and redraw.
		// Note that we don't clear before loading the textures as multiple calls to update may then clear, wait and
		// draw at the same time, resulting in twice as many things being rendered as there should be.

		const terrainTypes = getTerrainTypes();

		// Load textures
		const textures = Object.fromEntries(await Promise.all(terrainTypes
			.filter(type => type.fillTexture?.length)
			.map(async type => [type.id, await loadTexture(type.fillTexture)])));

		this._clear();

		/** @type {boolean} */
		const smartLabelPlacement = game.settings.get(moduleName, settings.smartLabelPlacement);

		for (const shape of this.#data) {
			const terrainStyle = terrainTypes.find(t => t.id === shape.terrainTypeId);
			if (!terrainStyle) continue;

			const label = terrainStyle.usesHeight
				? terrainStyle.textFormat
					.replace(/\%h\%/g, prettyFraction(shape.height))
					.replace(/\%e\%/g, prettyFraction(shape.elevation))
				: terrainStyle.textFormat;
			const textStyle = this.#getTextStyle(terrainStyle);

			// If the line style is dashed, don't draw the lines straight away, as the moveTo/lineTo used to draw the
			// dashed line makes the holes not work properly.
			// Instead, do the fill now, then the holes, THEN draw the dashed lines.
			// If we're using solid or no lines, we don't need to worry about this.
			this.#setGraphicsStyleFromTerrainStyle(terrainStyle, textures);
			if (terrainStyle.lineType === lineTypes.dashed) this.#graphics.lineStyle({ width: 0 });

			this.#drawTerrainPolygon(shape.polygon);

			for (const hole of shape.holes ?? []) {
				this.#graphics.beginHole();
				this.#drawTerrainPolygon(hole);
				this.#graphics.endHole();
			}

			// After drawing fill, then do the dashed lines
			if (terrainStyle.lineType === lineTypes.dashed) {
				this.#setGraphicsStyleFromTerrainStyle(terrainStyle, textures);
				const dashedLineStyle = {
					closed: true,
					dashSize: terrainStyle.lineDashSize ?? 15,
					gapSize: terrainStyle.lineGapSize ?? 10
				};

				drawDashedPath(this.#graphics, shape.polygon.vertices, dashedLineStyle);
				for (const hole of shape.holes ?? []) drawDashedPath(this.#graphics, hole.vertices, dashedLineStyle);
			}

			// Finally, do the label
			if (label?.length)
				this.#drawPolygonLabel(label, textStyle, shape, { smartPlacement: smartLabelPlacement, allowRotation: terrainStyle.textRotation });
		}
	}

	_clear() {
		this.#graphics?.clear();
		this.#labels?.removeChildren();
	}

	/**
	 * Sets the line and fill styles of the graphics context based on the given terrain style.
	 * @param {import("../utils/terrain-types.mjs").TerrainType | undefined} terrainStyle
	 * @param {{ [terrainTypeId: string]: PIXI.Texture } | undefined} textureMap
	 */
	#setGraphicsStyleFromTerrainStyle(terrainStyle, textureMap) {
		const color = Color.from(terrainStyle?.fillColor ?? "#000000");
		if (terrainStyle?.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && textureMap[terrainStyle.id])
			this.#graphics.beginTextureFill({
				texture: textureMap[terrainStyle.id],
				color,
				alpha: terrainStyle.fillOpacity
			});
		else
			this.#graphics.beginFill(color, terrainStyle?.fillOpacity ?? 0.4);

		this.#graphics.lineStyle({
			width: terrainStyle?.lineType === lineTypes.none ? 0 : terrainStyle?.lineWidth ?? 0,
			color: Color.from(terrainStyle?.lineColor ?? "#000000"),
			alpha: terrainStyle?.lineOpacity ?? 1,
			alignment: 0
		});
	}

	/**
	 * Draws a terrain polygon for the given (pixel) coordinates and the given terrain style.
	 * @param {Polygon} polygon
	 */
	#drawTerrainPolygon(polygon) {
		this.#graphics.moveTo(polygon.vertices[0].x, polygon.vertices[0].y);
		for (let i = 1; i < polygon.vertices.length; i++) {
			this.#graphics.lineTo(polygon.vertices[i].x, polygon.vertices[i].y);
		}
		this.#graphics.lineTo(polygon.vertices[0].x, polygon.vertices[0].y);
		this.#graphics.closePath();

		this.#graphics.endFill();
	}

	/**
	 * Draws a polygon's label at the given position.
	 * @param {string} label
	 * @param {PIXI.TextStyle} textStyle
	 * @param {import("../types").HeightMapShape} shape
	 * @param {Object} [options={}]
	 * @param {boolean} [options.smartPlacement=true] If true and the text does not fit at the centroid of the shape, then
	 * this function will do some additional calculations to try fit the label in at the widest point instead.
	 * @param {boolean} [options.allowRotation=false] If both this and smartPlacement are true, the placement may also
	 * rotate text to try get it to fit.
	 */
	#drawPolygonLabel(label, textStyle, shape, { smartPlacement = true, allowRotation = false } = {}) {
		// Create the text - with this we can get the width and height of the label
		const text = new PreciseText(label, textStyle);
		text.anchor.set(0.5);
		this.#labels.addChild(text);

		/** Sets the position of the text label so that it's center is at the given positions. */
		const setTextPosition = (x, y, rotated) => {
			text.x = x;
			text.y = y;
			text.rotation = rotated
				? (x < canvas.dimensions.width / 2 ? -1 : 1) * Math.PI / 2
				: 0;
		};

		const allEdges = shape.polygon.edges.concat(shape.holes?.flatMap(h => h.edges) ?? []);

		/** Tests that if the text was position centrally at the given point, if it fits in the shape entirely. */
		const testTextPosition = (x, y, rotated = false) => {
			const testEdge = rotated
				? new LineSegment(new Point(x, y - text.width / 2), new Point(x, y + text.width / 2))
				: new LineSegment(new Point(x - text.width / 2, y), new Point(x + text.width / 2, y));

			return shape.polygon.containsPoint(x, y)
				&& (shape.holes?.every(h => !h.containsPoint(x, y, false)) ?? true)
				&& allEdges.every(e => !e.intersectsAt(testEdge));
		};

		// If the label was to be positioned at the centroid of the polygon, and it was to entirely fit there, OR smart
		// positioning is disabled, then position it at the centroid.
		if (!smartPlacement || testTextPosition(...shape.polygon.centroid, false)) {
			setTextPosition(...shape.polygon.centroid);
			return;
		}

		// If we can rotate the text, then check if rotating it 90 degrees at the centroid would allow it to fit entirely.
		if (allowRotation && testTextPosition(...shape.polygon.centroid, true)) {
			setTextPosition(...shape.polygon.centroid, true);
			return;
		}

		// If the points fall outside of the polygon, we'll pick a few rays and find the widest and place the label there.
		// On square or hex row grids, we position it to the center of the cells (hex columns have alternating Xs, so don't)
		/** @type {number[]} */
		const testPoints = [...new Set(labelPositionAnchors
			.map(y => y * shape.polygon.boundingBox.h + shape.polygon.boundingBox.y1)
			.map(y => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENR, CONST.GRID_TYPES.HEXODDR].includes(canvas.grid.type)
				? canvas.grid.grid.getCenter(shape.polygon.boundingBox.xMid, y)[1]
				: y))];

		let widestPoint = { y: 0, x: 0, width: -Infinity };
		for (const y of testPoints) {
			/** @type {number[]} */
			const intersections = shape.polygon.edges
				.map(e => e.intersectsYAt(y))
				.concat(shape.holes?.flatMap(h => h.edges.flatMap(e => e.intersectsYAt(y))) ?? [])
				.filter(Number)
				.sort((a, b) => a - b);

			for (const [x1, x2] of chunk(intersections, 2)) {
				const width = x2 - x1;
				if (width > widestPoint.width)
					widestPoint = { x: (x1 + x2) / 2, y, width };
			}
		}

		// If we are allowed to rotate the text, do the same thing but in the opposite axis.
		// Then, take whichever is wider/taller and place the label there
		if (allowRotation) {
			// On square or hex col grids, we position it to the center of the cells (hex rows have alternating Ys, so don't)
			/** @type {number[]} */
			const testPoints = [...new Set(labelPositionAnchors
				.map(x => x * shape.polygon.boundingBox.w + shape.polygon.boundingBox.x1)
				.map(x => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(canvas.grid.type)
					? canvas.grid.grid.getCenter(x, shape.polygon.boundingBox.yMid)[0]
					: x))];

			let tallestPoint = { y: 0, x: 0, height: -Infinity };
			for (const x of testPoints) {
				/** @type {number[]} */
				const intersections = shape.polygon.edges
					.map(e => e.intersectsXAt(x))
					.concat(shape.holes?.flatMap(h => h.edges.flatMap(e => e.intersectsXAt(x))) ?? [])
					.filter(Number)
					.sort((a, b) => a - b);

				for (const [y1, y2] of chunk(intersections, 2)) {
					const height = y2 - y1;
					if (height > tallestPoint.height)
						tallestPoint = { x, y: (y1 + y2) / 2, height };
				}
			}

			if (tallestPoint.height > widestPoint.width) {
				setTextPosition(tallestPoint.x, tallestPoint.y, true);
				return;
			}
		}

		setTextPosition(widestPoint.x, widestPoint.y);
	}

	/**
	 * @param {import("../utils/terrain-types.mjs").TerrainType} terrainStyle
	 * @returns {PIXI.TextStyle}
	 */
	#getTextStyle(terrainStyle) {
		const style = CONFIG.canvasTextStyle.clone();

		style.fontFamily = terrainStyle.font ?? CONFIG.defaultFontFamily;
		style.fontSize = terrainStyle.textSize;

		const color = Color.from(terrainStyle.textColor ?? 0xFFFFFF);
		style.fill = color;
		style.strokeThickness = 4;
		style.stroke = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;

		return style;
	}

	/** @param {boolean} visible */
	#setVisible(visible) {
		return CanvasAnimation.animate([
			{
				parent: this,
				attribute: "alpha",
				to: visible ? 1 : 0
			}
		], { duration: 250 });
	}

	/**
	 * Sets the radius of the mask used to only show the height around the user's cursor.
	 * @param {number} radius The radius of the height map mask. Use <=0 to disable.
	 */
	#setMaskRadius(radius) {
		if (!this.#ready) return;

		// Remove previous mask
		this.mask = null;
		if (this.#cursorRadiusMask) this.removeChild(this.#cursorRadiusMask);
		this.#cursorRadiusMaskListenerTarget.off("globalmousemove", this.#updateCursorMaskPosition);

		// Stop here if not applying a new mask
		if (radius <= 0) return;

		// Create a radial gradient texture
		radius *= canvas.grid.size;

		const canvasElement = document.createElement("canvas");
		canvasElement.width = canvasElement.height = radius * 2;

		const context = canvasElement.getContext("2d");
		const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
		gradient.addColorStop(0.8, "rgba(255, 255, 255, 1)");
		gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

		context.fillStyle = gradient;
		context.fillRect(0, 0, radius * 2, radius * 2);

		// TODO: dispose old texture?
		this.#cursorRadiusMaskTexture = PIXI.Texture.from(canvasElement);

		// Create sprite
		this.#cursorRadiusMask = new PIXI.Sprite(this.#cursorRadiusMaskTexture);
		this.#cursorRadiusMask.anchor.set(0.5);
		this.addChild(this.#cursorRadiusMask);

		// Get current mouse coordinates
		const pos = canvas.mousePosition;
		this.#cursorRadiusMask.position.set(pos.x, pos.y);

		// Set mask
		this.mask = this.#cursorRadiusMask;
		this.#cursorRadiusMaskListenerTarget.on("globalmousemove", this.#updateCursorMaskPosition);
	}

	#updateCursorMaskPosition = event => {
		const pos = this.toLocal(event.data.global);
		this.#cursorRadiusMask.position.set(pos.x, pos.y);
	};

	/** @param {boolean} active */
	#onHighlightObjects = active => {
		// When using the "highlight objects" keybind, if the user has the radius option enabled and we're on the token
		// layer, show the entire height map
		if (canvas.activeLayer.name === "TokenLayer") {
			this.#isTokenObjectsHighlighted$.value = active;
		}
	};
}
