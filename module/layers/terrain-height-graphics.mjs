import { sceneControls } from "../config/controls.mjs";
import { flags, lineTypes, moduleName, settings, tools } from "../consts.mjs";
import { HeightMap, LineSegment, Point, Polygon } from "../geometry/index.mjs";
import { chunk } from '../utils/array-utils.mjs';
import { toSceneUnits } from "../utils/grid-utils.mjs";
import { debug } from "../utils/log.mjs";
import { prettyFraction } from "../utils/misc-utils.mjs";
import { drawDashedPath, drawInnerFade } from "../utils/pixi-utils.mjs";
import { join, Signal } from "../utils/signal.mjs";
import { getInvisibleSceneTerrainTypes, getTerrainTypeMap } from '../utils/terrain-types.mjs';
import { TerrainHeightLayer } from "./terrain-height-layer.mjs";

/**
 * The positions relative to the shape that the label placement algorithm will test, both horizontal and vertical.
 * Note that the order represents the order that ties are resolved, so in this case the middle will be prefered in ties.
 */
const labelPositionAnchors = [0.5, 0.4, 0.6, 0.2, 0.8];

/**
 * Specialised PIXI.Graphics instance for rendering a scene's terrain height data to the canvas.
 */
export class TerrainHeightGraphics extends PIXI.Container {

	/** @type {TerrainShapeGraphics[]} */
	#shapes = [];

	/** @type {PIXI.Texture} */
	cursorRadiusMaskTexture;

	/** @type {PIXI.Sprite} */
	cursorRadiusMask;

	// Visibility
	/** @type {Signal<boolean>} */
	isLayerActive$ = new Signal(false);

	/** @type {Signal<boolean>} */
	isHighlightingObjects$ = new Signal(false);

	/** @type {Signal<boolean>} */
	showOnTokenLayer$ = new Signal(game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer));

	/** @type {Signal<number>} */
	maskRadius$ = new Signal(game.settings.get(moduleName, settings.terrainHeightLayerVisibilityRadius));

	/** @type {(() => void)[]} */
	#subsciptions;

	constructor() {
		super();
		this.eventMode = "static";
		this.interactive = true;
		this.sortableChildren = true;

		Hooks.on("highlightObjects", this.#onHighlightObjects.bind(this));

		this.#subsciptions = [
			join(() => this.#updateShapeMasks(), this.isLayerActive$, this.isHighlightingObjects$, this.maskRadius$),
			join(() => this._updateShapesVisibility(), this.isLayerActive$, this.showOnTokenLayer$, sceneControls.activeTool$)
		];
	}

	// Sorting within the PrimaryCanvasGroup works by the `elevation`, then by `sortLayer` (500 for tiles, 700 for
	// tokens) then finally by the `sort`.
	// We will always use an elevation of 0, so that overhead tokens always render above.
	// A higher number means that it will be rendered below.
	// A future enhancement could be to render the shapes at their respective elevation, but for now that's not the case
	get elevation() { return 0; }

	get sortLayer() {
		// Note that during the v11 -> v12 migration, I made the mistake of getting this setting backwards, so when this
		// value is TRUE that actually means that the terrain layer should be rendered BELOW the tiles.
		// The UI labels have been corrected so that users have the expected behaviour, but the name of the flags and
		// settings have not been changed so that users do not have to re-do their config.
		// Will fix if there are ever any more breaking changes (such as a v13 port).
		/** @type {boolean} */
		const renderBelowTiles = canvas.scene?.getFlag(moduleName, flags.terrainLayerAboveTiles)
			?? game.settings.get(moduleName, settings.terrainLayerAboveTilesDefault);

		return renderBelowTiles ? 490 : 510;
	}

	/**
	 * Redraws the graphics layer using the supplied height map data.
	 * @param {HeightMap} heightMap
	 */
	async update(heightMap) {
		// If there are no shapes on the map, just clear it and return
		if (heightMap.shapes.length === 0) {
			this._clear();
			this.#updateShapeMasks();
			return;
		}

		// If there are shapes on the map, load the textures (if required), then clear and redraw.
		// Note that we don't clear before loading the textures as multiple calls to update may then clear, wait and
		// draw at the same time, resulting in twice as many things being rendered as there should be.

		const terrainTypes = getTerrainTypeMap();

		// Load textures
		/** @type {Map<string, { texture: PIXI.Texture; matrix: PIXI.Matrix }>} */
		const textures = new Map(await Promise.all([...terrainTypes.values()]
			.filter(type => type.fillTexture?.length)
			.map(async type => {
				const texture = await loadTexture(type.fillTexture);
				const { x: xOffset, y: yOffset } = type.fillTextureOffset;
				const { x: xScale, y: yScale } = type.fillTextureScale;
				const matrix = new PIXI.Matrix(xScale / 100, 0, 0, yScale / 100, xOffset, yOffset);
				return [type.id, { texture, matrix }];
			})));

		this._clear();

		for (const shape of heightMap.shapes) {
			const terrainType = terrainTypes.get(shape.terrainTypeId);
			if (!terrainType) continue;

			const shapeGraphics = new TerrainShapeGraphics(shape, terrainType, textures.get(terrainType.id));

			// Sort terrains that use a height in elevation order. For terrains that don't use a height, always sort
			// them under terrain that does have a height.
			shapeGraphics.zIndex = terrainType.usesHeight ? shape.elevation : -1;

			this.#shapes.push(shapeGraphics);
			this.addChild(shapeGraphics);
		}

		this.#updateShapeMasks();
		this._updateShapesVisibility({ animate: false });
	}

	_tearDown() {
		this._clear();
		this.#subsciptions.forEach(unsubscribe => unsubscribe());
		this.#subsciptions = [];
	}

	_clear() {
		this.#shapes.forEach(s => this.removeChild(s));
		this.#shapes = [];
		this.parent?.sortChildren();
	}

	/**
	 * @param {{ height: number; elevation: number; }} shape
	 * @param {import("../utils/terrain-types.mjs").TerrainType} terrainStyle
	 * @returns
	 */
	static _getLabelText(shape, terrainStyle) {
		// If the shape has elevation, and the user has provided a different format for elevated terrain, use that.
		const format = shape.elevation !== 0 && terrainStyle.elevatedTextFormat?.length > 0
			? terrainStyle.elevatedTextFormat
			: terrainStyle.textFormat;

		return terrainStyle.usesHeight
			? format
				.replace(/\%h\%/g, prettyFraction(toSceneUnits(shape.height)))
				.replace(/\%e\%/g, prettyFraction(toSceneUnits(shape.elevation)))
				.replace(/\%t\%/g, prettyFraction(toSceneUnits(shape.height + shape.elevation)))
			: format;
	}

	/**
	 * @param {Object} [options]
	 * @param {boolean} [options.animate]
	*/
	async _updateShapesVisibility({ animate = true } = {}) {
		const invisibleTerrainTypes = getInvisibleSceneTerrainTypes(canvas.scene);

		await Promise.all(this.#shapes.map(s => s._setVisible(
			// All shapes should always be visible if the THT layer is active (EXCEPT when on the visibility tool)
			(this.isLayerActive$.value && sceneControls.activeTool$.value !== tools.terrainVisibility) ||

			// Shapes should be visible if THT is turned on for other layer or the terrain type is always visible AND
			// that terrain type is not hidden on this scene
			(
				(this.showOnTokenLayer$.value || s._terrainType.isAlwaysVisible) &&
				!invisibleTerrainTypes.has(s._terrainType.id)
			),
			animate
		)));
	}

	/**
	 * Updates the radius of the mask used to only show the height around the user's cursor.
	 */
	#updateShapeMasks() {
		// If the THT layer is active, or the user is clicking the highlight objects button, then always show the entire
		// map (radius = 0). Otherwise, use the configured value.
		let radius = this.isLayerActive$.value || this.isHighlightingObjects$.value
			? 0
			: this.maskRadius$.value;

		debug(`Updating terrain height layer graphics mask size to ${radius}`);

		// Remove previous mask
		this.#shapes.forEach(shape => shape._setMask(null));
		if (this.cursorRadiusMask) this.removeChild(this.cursorRadiusMask);
		TerrainHeightLayer.current?._eventListenerObj?.off("globalmousemove", this.#updateCursorMaskPosition);

		// Stop here if not applying a new mask. We are not applying a mask if:
		// - The radius is 0, i.e. no mask
		// - If there are no shapes; if there are no shapes to apply the mask to, it will appear as an actual white
		//   circle on the canvas.
		if (radius <= 0 || this.#shapes.length === 0) return;

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

		const texture = PIXI.Texture.from(canvasElement);

		// Create sprite
		this.cursorRadiusMask = new PIXI.Sprite(texture);
		this.cursorRadiusMask.anchor.set(0.5);
		this.addChild(this.cursorRadiusMask);

		// Get current mouse coordinates
		const pos = canvas.mousePosition;
		this.cursorRadiusMask.position.set(pos.x, pos.y);

		// Set mask
		this.#shapes.forEach(shape => shape._setMask(this.cursorRadiusMask));
		TerrainHeightLayer.current?._eventListenerObj.on("globalmousemove", this.#updateCursorMaskPosition);
	}

	#updateCursorMaskPosition = event => {
		const pos = this.toLocal(event.data.global);
		this.cursorRadiusMask.position.set(pos.x, pos.y);
	}

	#onHighlightObjects(active) {
		// When using the "highlight objects" keybind, if the user has the radius option enabled and we're on the token
		// layer, show the entire height map
		if (canvas.activeLayer.name === "TokenLayer") {
			this.isHighlightingObjects$.value = active;
		}
	}
}

class TerrainShapeGraphics extends PIXI.Container {

	/** @type {string} */
	#graphicId;

	/** @type {import("../geometry/height-map-shape.mjs").HeightMapShape} */
	#shape;

 	/** @type {import("../utils/terrain-types.mjs").TerrainType} */
	_terrainType;

	/** @type {PIXI.Graphics} */
	#graphics;

	/** @type {PreciseText} */
	#label;

	/** @type {PIXI.Texture | undefined} */
	#texture;

	/** @type {PIXI.Matrix | undefined} */
	#textureMatrix;

	/**
	 * @param {import("../geometry/height-map-shape.mjs").HeightMapShape} shape
	 * @param {import("../utils/terrain-types.mjs").TerrainType} terrainType
	 * @param {{ texture: PIXI.Texture; matrix: PIXI.Matrix; } | undefined} texture
	*/
	constructor(shape, terrainType, texture) {
		super();

		this.#graphicId = foundry.utils.randomID();
		this.#shape = shape;
		this._terrainType = terrainType;
		this.#texture = texture?.texture;
		this.#textureMatrix = texture?.matrix;

		this.#graphics = this.addChild(new PIXI.Graphics());
		this.#drawGraphics();

		this.#label = this.addChild(this.#createLabel());
	}

	/**
	 * @param {boolean} visible
	 * @param {boolean} animate
	 */
	async _setVisible(visible, animate) {
		if (animate) {
			const name = `thtShape_${this.#graphicId}_alpha`;
			await CanvasAnimation.animate([
				{
					parent: this,
					attribute: "alpha",
					to: visible ? 1 : 0
				}
			], { name, duration: 250 });
		} else {
			this.alpha = visible ? 1 : 0;
		}
	}

	_setMask(mask) {
		// Only add a mask if this terrain type allows that
		if (!this._terrainType.isAlwaysVisible)
			this.mask = mask;
	}

	#drawGraphics() {
		// Draw the fill
		this.#graphics.lineStyle({ width: 0 });
		this.#setFillStyleFromTerrainType();
		this.#drawPolygon(this.#shape.polygon);

		for (const hole of this.#shape.holes) {
			this.#graphics.beginHole();
			this.#drawPolygon(hole);
			this.#graphics.endHole();
		}

		// After drawing the fill, then add the fade effect on top (if enabled)
		this.#graphics.endFill();
		const lineStyle = this.#getLineStyleFromTerrainType();

		if (this._terrainType.lineFadeDistance > 0 && this._terrainType.lineFadeOpacity > 0) {
			const fadeStyle = {
				color: Color.from(this._terrainType.lineFadeColor ?? "#000000"),
				alpha: this._terrainType.lineFadeOpacity ?? 0,
				distance: this._terrainType.lineFadeDistance * canvas.grid.size,
				resolution: 20
			};

			drawInnerFade(this.#graphics, this.#shape.polygon.vertices, fadeStyle);
			for (const hole of this.#shape.holes) drawInnerFade(this.#graphics, hole.vertices, fadeStyle);
		}

		// After drawing the fill and fade, then do the lines
		this.#graphics.lineStyle(lineStyle);
		if (this._terrainType.lineType === lineTypes.dashed) {
			const dashedLineStyle = {
				closed: true,
				dashSize: this._terrainType.lineDashSize ?? 15,
				gapSize: this._terrainType.lineGapSize ?? 10
			};

			drawDashedPath(this.#graphics, this.#shape.polygon.vertices, dashedLineStyle);
			for (const hole of this.#shape.holes) drawDashedPath(this.#graphics, hole.vertices, dashedLineStyle);

		} else {
			this.#drawPolygon(this.#shape.polygon);
			for (const hole of this.#shape.holes) this.#drawPolygon(hole);
		}
	}

	/** @param {Polygon} polygon */
	#drawPolygon(polygon) {
		this.#graphics.moveTo(polygon.vertices[0].x, polygon.vertices[0].y);
		for (let i = 1; i < polygon.vertices.length; i++) {
			this.#graphics.lineTo(polygon.vertices[i].x, polygon.vertices[i].y);
		}
		this.#graphics.lineTo(polygon.vertices[0].x, polygon.vertices[0].y);
		this.#graphics.closePath();

		this.#graphics.endFill();
	}

	#setFillStyleFromTerrainType() {
		const color = Color.from(this._terrainType.fillColor ?? "#000000");
		if (this._terrainType.fillType === CONST.DRAWING_FILL_TYPES.NONE)
			this.#graphics.beginFill(0x000000, 0);
		else if (this._terrainType.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && this.#texture)
			this.#graphics.beginTextureFill({
				texture: this.#texture,
				color,
				alpha: this._terrainType.fillOpacity,
				matrix: this.#textureMatrix
			});
		else
			this.#graphics.beginFill(color, this._terrainType.fillOpacity ?? 0.4);
	}

	#getLineStyleFromTerrainType() {
		return {
			width: this._terrainType.lineType === lineTypes.none ? 0 : this._terrainType.lineWidth ?? 0,
			color: Color.from(this._terrainType.lineColor ?? "#000000"),
			alpha: this._terrainType.lineOpacity ?? 1,
			alignment: 0
		};
	}

	#createLabel() {
		const smartPlacement = game.settings.get(moduleName, settings.smartLabelPlacement);
		const allowRotation = this._terrainType.textRotation;
		const textStyle = this.#getTextStyle();
		const text = TerrainHeightGraphics._getLabelText(this.#shape, this._terrainType);

		// Create the label - with this we can get the width and height
		const label = new PreciseText(text, textStyle);
		label.anchor.set(0.5);

		/** Sets the position of the label so that it's center is at the given positions. */
		const setLabelPosition = (x, y, rotated) => {
			label.x = x;
			label.y = y;
			label.rotation = rotated
				? (x < canvas.dimensions.width / 2 ? -1 : 1) * Math.PI / 2
				: 0;
		};

		const allEdges = this.#shape.polygon.edges.concat(this.#shape.holes.flatMap(h => h.edges));

		/** Tests that if the label was position centrally at the given point, if it fits in the shape entirely. */
		const testLabelPosition = (x, y, rotated = false) => {
			const testEdge = rotated
				? new LineSegment(new Point(x, y - label.width / 2), new Point(x, y + label.width / 2))
				: new LineSegment(new Point(x - label.width / 2, y), new Point(x + label.width / 2, y));

			return this.#shape.polygon.containsPoint(x, y)
				&& this.#shape.holes.every(h => !h.containsPoint(x, y, false))
				&& allEdges.every(e => !e.intersectsAt(testEdge));
		};

		// If the label was to be positioned at the centroid of the polygon, and it was to entirely fit there, OR smart
		// positioning is disabled, then position it at the centroid.
		if (!smartPlacement || testLabelPosition(...this.#shape.polygon.centroid, false)) {
			setLabelPosition(...this.#shape.polygon.centroid);
			return label;
		}

		// If we can rotate the text, then check if rotating it 90 degrees at the centroid would allow it to fit entirely.
		if (allowRotation && testLabelPosition(...this.#shape.polygon.centroid, true)) {
			setLabelPosition(...this.#shape.polygon.centroid, true);
			return label;
		}

		// If the points fall outside of the polygon, we'll pick a few rays and find the widest and place the label there.
		// On square or hex row grids, we position it to the center of the cells (hex columns have alternating Xs, so don't)
		/** @type {number[]} */
		const testPoints = [...new Set(labelPositionAnchors
			.map(y => y * this.#shape.polygon.boundingBox.h + this.#shape.polygon.boundingBox.y1)
			.map(y => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENR, CONST.GRID_TYPES.HEXODDR].includes(canvas.grid.type)
				? canvas.grid.getCenterPoint({ x: this.#shape.polygon.boundingBox.xMid, y }).y
				: y))];

		let widestPoint = { y: 0, x: 0, width: -Infinity };
		for (const y of testPoints) {
			/** @type {number[]} */
			const intersections = this.#shape.polygon.edges
				.map(e => e.intersectsYAt(y))
				.concat(this.#shape.holes.flatMap(h => h.edges.flatMap(e => e.intersectsYAt(y))))
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
				.map(x => x * this.#shape.polygon.boundingBox.w + this.#shape.polygon.boundingBox.x1)
				.map(x => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(canvas.grid.type)
					? canvas.grid.getCenterPoint({ x, y: this.#shape.polygon.boundingBox.yMid }).x
					: x))];

			let tallestPoint = { y: 0, x: 0, height: -Infinity };
			for (const x of testPoints) {
				/** @type {number[]} */
				const intersections = this.#shape.polygon.edges
					.map(e => e.intersectsXAt(x))
					.concat(this.#shape.holes.flatMap(h => h.edges.flatMap(e => e.intersectsXAt(x))))
					.filter(Number)
					.sort((a, b) => a - b);

				for (const [y1, y2] of chunk(intersections, 2)) {
					const height = y2 - y1;
					if (height > tallestPoint.height)
						tallestPoint = { x, y: (y1 + y2) / 2, height };
				}
			}

			if (tallestPoint.height > widestPoint.width) {
				setLabelPosition(tallestPoint.x, tallestPoint.y, true);
				return label;
			}
		}

		setLabelPosition(widestPoint.x, widestPoint.y);

		return label;
	}

	/** @returns {PIXI.TextStyle} */
	#getTextStyle() {
		const style = CONFIG.canvasTextStyle.clone();

		style.fontFamily = this._terrainType.font ?? CONFIG.defaultFontFamily;
		style.fontSize = this._terrainType.textSize;

		const color = Color.from(this._terrainType.textColor ?? 0xFFFFFF);
		style.fill = color;
		style.strokeThickness = 4;
		style.stroke = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;

		return style;
	}
}
