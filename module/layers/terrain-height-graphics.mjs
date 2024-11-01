import { flags, lineTypes, moduleName, settings } from "../consts.mjs";
import { HeightMap, LineSegment, Point, Polygon } from "../geometry/index.mjs";
import { chunk } from '../utils/array-utils.mjs';
import { toSceneUnits } from "../utils/grid-utils.mjs";
import { debug } from "../utils/log.mjs";
import { prettyFraction } from "../utils/misc-utils.mjs";
import { drawDashedPath } from "../utils/pixi-utils.mjs";
import { join, Signal } from "../utils/signal.mjs";
import { getTerrainTypeMap } from '../utils/terrain-types.mjs';

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
			join(() => this.#updateShapesVisibility(), this.isLayerActive$, this.showOnTokenLayer$)
		];
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
		const renderAboveTiles = game.canvas.scene?.getFlag(moduleName, flags.terrainLayerAboveTiles)
			?? game.settings.get(moduleName, settings.terrainLayerAboveTilesDefault);

		return renderAboveTiles ? 9999999999 : -9999999998;
	}

	/**
	 * Redraws the graphics layer using the supplied height map data.
	 * @param {HeightMap} heightMap
	 */
	async update(heightMap) {
		// If there are no shapes on the map, just clear it and return
		if (heightMap.shapes.length === 0) {
			this._clear();
			return;
		}

		// If there are shapes on the map, load the textures (if required), then clear and redraw.
		// Note that we don't clear before loading the textures as multiple calls to update may then clear, wait and
		// draw at the same time, resulting in twice as many things being rendered as there should be.

		const terrainTypes = getTerrainTypeMap();

		// Load textures
		/** @type {Map<string, PIXI.Texture>} */
		const textures = new Map(await Promise.all([...terrainTypes.values()]
			.filter(type => type.fillTexture?.length)
			.map(async type => [type.id, await loadTexture(type.fillTexture)])));

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
		this.#updateShapesVisibility();
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
		return terrainStyle.usesHeight
			? terrainStyle.textFormat
				.replace(/\%h\%/g, prettyFraction(toSceneUnits(shape.height)))
				.replace(/\%e\%/g, prettyFraction(toSceneUnits(shape.elevation)))
			: terrainStyle.textFormat;
	}

	async #updateShapesVisibility() {
		// Shapes should be visible if the THT layer is active, or if shapes are turned on for other layers.
		const visible = this.isLayerActive$.value || this.showOnTokenLayer$.value;
		await Promise.all(this.#shapes.map(s => s._setVisible(visible)));
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
		game.canvas.terrainHeightLayer._eventListenerObj.off("globalmousemove", this.#updateCursorMaskPosition);

		// Stop here if not applying a new mask
		if (radius <= 0) return;

		// Create a radial gradient texture
		radius *= game.canvas.grid.size;

		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = radius * 2;

		const context = canvas.getContext("2d");
		const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
		gradient.addColorStop(0.8, "rgba(255, 255, 255, 1)");
		gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

		context.fillStyle = gradient;
		context.fillRect(0, 0, radius * 2, radius * 2);

		const texture = PIXI.Texture.from(canvas);

		// Create sprite
		this.cursorRadiusMask = new PIXI.Sprite(texture);
		this.cursorRadiusMask.anchor.set(0.5);
		this.addChild(this.cursorRadiusMask);

		// Get current mouse coordinates
		const pos = game.canvas.mousePosition;
		this.cursorRadiusMask.position.set(pos.x, pos.y);

		// Set mask
		this.#shapes.forEach(shape => shape._setMask(this.cursorRadiusMask));
		game.canvas.terrainHeightLayer._eventListenerObj.on("globalmousemove", this.#updateCursorMaskPosition);
	}

	#updateCursorMaskPosition = event => {
		const pos = this.toLocal(event.data.global);
		this.cursorRadiusMask.position.set(pos.x, pos.y);
	}

	#onHighlightObjects(active) {
		// When using the "highlight objects" keybind, if the user has the radius option enabled and we're on the token
		// layer, show the entire height map
		if (game.canvas.activeLayer.name === "TokenLayer") {
			this.isHighlightingObjects$.value = active;
		}
	}
}

class TerrainShapeGraphics extends PIXI.Container {

	/** @type {import("../geometry/height-map.mjs").HeightMapShape} */
	#shape;

 	/** @type {import("../utils/terrain-types.mjs").TerrainType} */
	#terrainType;

	/** @type {PIXI.Graphics} */
	#graphics;

	/** @type {PreciseText} */
	#label;

	/** @type {PIXI.Texture | undefined} */
	#texture;

	/**
	 * @param {import("../geometry/height-map.mjs").HeightMapShape} shape
	 * @param {import("../utils/terrain-types.mjs").TerrainType} terrainType
	 * @param {PIXI.Texture | undefined} texture
	*/
	constructor(shape, terrainType, texture) {
		super();

		this.#shape = shape;
		this.#terrainType = terrainType;
		this.#texture = texture;

		this.#graphics = this.addChild(new PIXI.Graphics());
		this.#drawGraphics();

		this.#label = this.addChild(this.#createLabel());
	}

	async _setVisible(visible) {
		// Only change the visibility if this terrain type allows that
		if (!this.#terrainType.isAlwaysVisible)
			await CanvasAnimation.animate([
				{
					parent: this,
					attribute: "alpha",
					to: visible ? 1 : 0
				}
			], { duration: 250 });
	}

	_setMask(mask) {
		// Only add a mask if this terrain type allows that
		if (!this.#terrainType.isAlwaysVisible)
			this.mask = mask;
	}

	#drawGraphics() {
		// If the line style is dashed, don't draw the lines straight away, as the moveTo/lineTo used to draw the dashed
		// line makes the holes not work properly.
		// Instead, do the fill now, then the holes, THEN draw the dashed lines.
		// If we're using solid or no lines, we don't need to worry about this.
		this.#setGraphicsStyleFromTerrainType();
		if (this.#terrainType.lineType === lineTypes.dashed) this.#graphics.lineStyle({ width: 0 });

		this.#drawPolygon(this.#shape.polygon);

		for (const hole of this.#shape.holes) {
			this.#graphics.beginHole();
			this.#drawPolygon(hole);
			this.#graphics.endHole();
		}

		// After drawing fill, then do the dashed lines
		if (this.#terrainType.lineType === lineTypes.dashed) {
			this.#setGraphicsStyleFromTerrainType();
			const dashedLineStyle = {
				closed: true,
				dashSize: this.#terrainType.lineDashSize ?? 15,
				gapSize: this.#terrainType.lineGapSize ?? 10
			};

			drawDashedPath(this.#graphics, this.#shape.polygon.vertices, dashedLineStyle);
			for (const hole of this.#shape.holes) drawDashedPath(this.#graphics, hole.vertices, dashedLineStyle);
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

	#setGraphicsStyleFromTerrainType() {
		const color = Color.from(this.#terrainType.fillColor ?? "#000000");
		if (this.#terrainType.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && this.#texture)
			this.#graphics.beginTextureFill({
				texture: this.#texture,
				color,
				alpha: this.#terrainType.fillOpacity
			});
		else
			this.#graphics.beginFill(color, this.#terrainType.fillOpacity ?? 0.4);

		this.#graphics.lineStyle({
			width: this.#terrainType.lineType === lineTypes.none ? 0 : this.#terrainType.lineWidth ?? 0,
			color: Color.from(this.#terrainType.lineColor ?? "#000000"),
			alpha: this.#terrainType.lineOpacity ?? 1,
			alignment: 0
		});
	}

	#createLabel() {
		const smartPlacement = game.settings.get(moduleName, settings.smartLabelPlacement);
		const allowRotation = this.#terrainType.textRotation;
		const textStyle = this.#getTextStyle();
		const text = TerrainHeightGraphics._getLabelText(this.#shape, this.#terrainType);

		// Create the label - with this we can get the width and height
		const label = new PreciseText(text, textStyle);
		label.anchor.set(0.5);

		/** Sets the position of the label so that it's center is at the given positions. */
		const setLabelPosition = (x, y, rotated) => {
			label.x = x;
			label.y = y;
			label.rotation = rotated
				? (x < game.canvas.dimensions.width / 2 ? -1 : 1) * Math.PI / 2
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
			.map(y => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENR, CONST.GRID_TYPES.HEXODDR].includes(game.canvas.grid.type)
				? canvas.grid.grid.getCenter(this.#shape.polygon.boundingBox.xMid, y)[1]
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
				.map(x => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(game.canvas.grid.type)
					? canvas.grid.grid.getCenter(x, this.#shape.polygon.boundingBox.yMid)[0]
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

		style.fontFamily = this.#terrainType.font ?? CONFIG.defaultFontFamily;
		style.fontSize = this.#terrainType.textSize;

		const color = Color.from(this.#terrainType.textColor ?? 0xFFFFFF);
		style.fill = color;
		style.strokeThickness = 4;
		style.stroke = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;

		return style;
	}
}
