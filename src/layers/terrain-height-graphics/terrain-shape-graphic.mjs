/** @import { TerrainShape } from "../../geometry/terrain-shape.mjs"; */
/** @import { TerrainType } from "../../stores/terrain-types.mjs" */
/** @import { TerrainHeightGraphicsLayer } from "./terrain-height-graphics-layer.mjs" */
import { lineTypes, moduleName, settingNames } from "../../consts.mjs";
import { LineSegment } from "../../geometry/line-segment.mjs";
import { Point } from "../../geometry/point.mjs";
import { getTerrainType, terrainTypes$ } from "../../stores/terrain-types.mjs";
import { chunk } from "../../utils/array-utils.mjs";
import { toSceneUnits } from "../../utils/grid-utils.mjs";
import { prettyFraction } from "../../utils/misc-utils.mjs";
import { drawDashedPath, drawInnerFade } from "../../utils/pixi-utils.mjs";

/**
 * The positions relative to the shape that the label placement algorithm will test, both horizontal and vertical.
 * Note that the order represents the order that ties are resolved, so in this case the middle will be prefered in ties.
 */
export const labelPositionAnchors = [0.5, 0.4, 0.6, 0.2, 0.8];

export class TerrainShapeGraphic extends PIXI.Container {

	/** @type {TerrainHeightGraphicsLayer} */
	#parent;

	/** @type {string} */
	#graphicId;

	/** @type {TerrainShape} */
	#shape;

	/** @type {TerrainType} */
	_terrainType;

	/** @type {PIXI.Graphics} */
	#graphics;

	/** @type {PreciseText} */
	#label;

	#destroyController = new AbortController();

	/**
	 * @param {TerrainHeightGraphicsLayer} parent
	 * @param {TerrainShape} shape
	*/
	constructor(parent, shape) {
		super();

		this.#parent = parent;
		this.#graphicId = foundry.utils.randomID();
		this.#shape = shape;

		this._terrainType = getTerrainType(shape.terrainTypeId);

		this.#redraw();
	}

	get elevation() {
		// Elevation is the primary Z sorting key - use the shape's elevation for this
		// TODO: for no-height terrain this should be 0 or a very high number(?) depending on settings
		return this.#shape.elevation;
	}

	// `sortLayer` is the first tie-break and varies depending on the item type (e.g. tiles = 500, tokens = 700)
	// Render the terrain just above or below the tiles depending on the setting (handled in graphics layer).
	sortLayer = 490;

	get sort() {
		// `sort` is the second tie-break, and we use the terrain type's index in the terrain type list.
		return terrainTypes$.value.findIndex(t => t.id === this.#shape.terrainTypeId);
	}

	get _canHaveMask() {
		return !this._terrainType.isAlwaysVisible;
	}

	/**
	 * @param {boolean} visible
	 * @param {boolean} animate
	 */
	async _setVisible(visible, animate) {
		const name = `thtShape_${this.#graphicId}_alpha`;
		await CanvasAnimation.animate([
			{
				parent: this,
				attribute: "alpha",
				to: visible ? 1 : 0
			}
		], { name, duration: animate ? 250 : 1 });
	}

	_setMask(mask) {
		this.mask = this._canHaveMask ? mask : null;
	}

	destroy() {
		this.#destroyController.abort();
	}

	async #redraw() {
		if (this.#graphics) this.removeChild(this.#graphics);
		if (this.#label) this.removeChild(this.#label);

		this.#graphics = this.addChild(await this.#drawGraphics());
		this.#label = this.addChild(this.#createLabel());
	}

	/** @returns {Promise<PIXI.Graphics>} */
	async #drawGraphics() {
		const graphics = new PIXI.Graphics();

		// Draw the fill
		graphics.lineStyle({ width: 0 });
		await this.#setFillStyleFromTerrainType(graphics);
		this.#drawPolygon(graphics, this.#shape.polygon);

		for (const hole of this.#shape.holes) {
			graphics.beginHole();
			this.#drawPolygon(graphics, hole);
			graphics.endHole();
		}

		// After drawing the fill, then add the fade effect on top (if enabled)
		graphics.endFill();
		const lineStyle = this.#getLineStyleFromTerrainType();

		if (this._terrainType.lineFadeDistance > 0 && this._terrainType.lineFadeOpacity > 0) {
			const fadeStyle = {
				color: Color.from(this._terrainType.lineFadeColor ?? "#000000"),
				alpha: this._terrainType.lineFadeOpacity ?? 0,
				distance: this._terrainType.lineFadeDistance * canvas.grid.size,
				resolution: 20
			};

			drawInnerFade(graphics, this.#shape.polygon.vertices, fadeStyle);
			for (const hole of this.#shape.holes) drawInnerFade(graphics, hole.vertices, fadeStyle);
		}

		// After drawing the fill and fade, then do the lines
		graphics.lineStyle(lineStyle);
		if (this._terrainType.lineType === lineTypes.dashed) {
			const dashedLineStyle = {
				closed: true,
				dashSize: this._terrainType.lineDashSize ?? 15,
				gapSize: this._terrainType.lineGapSize ?? 10
			};

			drawDashedPath(graphics, this.#shape.polygon.vertices, dashedLineStyle);
			for (const hole of this.#shape.holes) drawDashedPath(graphics, hole.vertices, dashedLineStyle);

		} else {
			this.#drawPolygon(graphics, this.#shape.polygon);
			for (const hole of this.#shape.holes) this.#drawPolygon(graphics, hole);
		}

		return graphics;
	}

	/** @param {Polygon} polygon */
	#drawPolygon(graphics, polygon) {
		graphics.moveTo(polygon.vertices[0].x, polygon.vertices[0].y);
		for (let i = 1; i < polygon.vertices.length; i++) {
			graphics.lineTo(polygon.vertices[i].x, polygon.vertices[i].y);
		}
		graphics.lineTo(polygon.vertices[0].x, polygon.vertices[0].y);
		graphics.closePath();

		graphics.endFill();
	}

	async #setFillStyleFromTerrainType(graphics) {
		const color = Color.from(this._terrainType.fillColor ?? "#000000");

		if (this._terrainType.fillType === CONST.DRAWING_FILL_TYPES.NONE) {
			graphics.beginFill(0x000000, 0);

		} else if (this._terrainType.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && this._terrainType.fillTexture?.length) {
			const { x: xOffset, y: yOffset } = this._terrainType.fillTextureOffset;
			const { x: xScale, y: yScale } = this._terrainType.fillTextureScale;
			const matrix = new PIXI.Matrix(xScale / 100, 0, 0, yScale / 100, xOffset, yOffset);

			graphics.beginTextureFill({
				texture: await this.#parent._terrainTextures.get(this.#shape.terrainTypeId),
				color,
				alpha: this._terrainType.fillOpacity,
				matrix
			});

		} else {
			graphics.beginFill(color, this._terrainType.fillOpacity ?? 0.4);
		}
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
		const smartPlacement = game.settings.get(moduleName, settingNames.smartLabelPlacement);
		const allowRotation = this._terrainType.textRotation;
		const textStyle = this.#getTextStyle();
		const text = getLabelText(this.#shape, this._terrainType);

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
				? new LineSegment(new Point(x, y - (label.width / 2)), new Point(x, y + (label.width / 2)))
				: new LineSegment(new Point(x - (label.width / 2), y), new Point(x + (label.width / 2), y));

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
			.map(y => (y * this.#shape.polygon.boundingBox.h) + this.#shape.polygon.boundingBox.y1)
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
				.map(x => (x * this.#shape.polygon.boundingBox.w) + this.#shape.polygon.boundingBox.x1)
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

		const color = Color.from(this._terrainType.textColor ?? 0xFFFFFF);
		const autoStrokeColor = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;

		style.fontFamily = this._terrainType.font ?? CONFIG.defaultFontFamily;
		style.fontSize = this._terrainType.textSize;

		style.fill = color;

		style.strokeThickness = this._terrainType.textStrokeThickness;
		style.stroke = this._terrainType.textStrokeColor?.length
			? Color.from(this._terrainType.textStrokeColor)
			: autoStrokeColor;

		style.dropShadow = this._terrainType.textShadowAmount > 0;
		style.dropShadowBlur = this._terrainType.textShadowAmount;
		style.dropShadowColor = this._terrainType.textShadowColor?.length
			? Color.from(this._terrainType.textShadowColor)
			: autoStrokeColor;
		style.dropShadowAlpha = this._terrainType.textShadowOpacity;

		return style;
	}
}

/**
 * @param {{ height: number; elevation: number; }} shape
 * @param {TerrainType} terrainStyle
 */
export function getLabelText(shape, terrainStyle) {
	// If the shape has elevation, and the user has provided a different format for elevated terrain, use that.
	const format = shape.elevation !== 0 && terrainStyle.elevatedTextFormat?.length > 0
		? terrainStyle.elevatedTextFormat
		: terrainStyle.textFormat;

	return terrainStyle.usesHeight
		? format
			.replace(/%h%/g, prettyFraction(toSceneUnits(shape.height)))
			.replace(/%e%/g, prettyFraction(toSceneUnits(shape.elevation)))
			.replace(/%t%/g, prettyFraction(toSceneUnits(shape.height + shape.elevation)))
		: format;
}
