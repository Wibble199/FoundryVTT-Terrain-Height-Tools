/** @import { Polygon } from "../../geometry/polygon.mjs" */
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
import { drawDashedPath } from "../../utils/pixi-utils.mjs";

/**
 * The positions relative to the shape that the label placement algorithm will test, both horizontal and vertical.
 * Note that the order represents the order that ties are resolved, so in this case the middle will be prefered in ties.
 */
const labelPositionAnchors = [0.5, 0.4, 0.6, 0.2, 0.8];

export class TerrainShapeGraphic extends PIXI.Container {

	/** @type {TerrainHeightGraphicsLayer} */
	#parent;

	/** @type {string} */
	#graphicId;

	/** @type {TerrainShape} */
	shape;

	/** @type {TerrainType} */
	terrainType;

	/** @type {PIXI.Graphics} */
	#borderGraphics;

	/** @type {PIXI.Graphics} */
	#fillGraphics;

	/** @type {PIXI.Graphics} */
	#fadeGraphics;

	/** @type {PIXI.Graphics} */
	#fadeMask;

	/** @type {PreciseText} */
	#label;

	/**
	 * @param {TerrainHeightGraphicsLayer} parent
	 * @param {TerrainShape} shape
	*/
	constructor(parent, shape) {
		super();
		this.sortableChildren = true;

		this.#parent = parent;
		this.#graphicId = foundry.utils.randomID();

		this.shape = shape;
		this.terrainType = getTerrainType(shape.terrainTypeId);

		this._redrawLabel();
		this.#redrawBorder();
		this.#redrawFade();
		this.#redrawFill();
	}

	_destroy() {
		// On destroy, if we had a fade graphic ensure that is removed from Foundry's tracker
		if (this.#fadeGraphics) {
			canvas.blurFilters.delete(this.#fadeGraphics.filters[0]);
		}
	}

	/**
	 * We will always use an elevation of 0, so that overhead tokens always render above.
	 */
	elevation = 0;

	/**
	 * `sortLayer` is the first tie-break and varies depending on the item type (e.g. tiles = 500, tokens = 700)
	 * This value is handled in the graphics layer
	 */
	sortLayer = 0;

	/**
	 * `sort` is the second tie-break, and we use this to force zones to either be above or below non-zones.
	 * This value is handled in the graphics layer
	 */
	sort = 0;

	/**
	 * `zIndex` is the third and final tie-break, and we use the terrain type's index in the terrain type list.
	 */
	get zIndex() {
		return terrainTypes$.value.findIndex(t => t.id === this.shape.terrainTypeId);
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

	// -------------------- //
	// Main drawing methods //
	// -------------------- //
	/** @returns {Promise<PIXI.Graphics>} */
	#redrawBorder() {
		if (this.#borderGraphics) this.removeChild(this.#borderGraphics);

		const g = new PIXI.Graphics();
		g.zIndex = 20;
		this.#borderGraphics = this.addChild(g);

		const lineStyle = this.#getLineStyleFromTerrainType();

		g.lineStyle(lineStyle);
		if (this.terrainType.lineType === lineTypes.dashed) {
			const dashedLineStyle = {
				closed: true,
				dashSize: this.terrainType.lineDashSize ?? 15,
				gapSize: this.terrainType.lineGapSize ?? 10
			};

			drawDashedPath(g, this.shape.polygon.vertices, dashedLineStyle);
			for (const hole of this.shape.holes) drawDashedPath(g, hole.vertices, dashedLineStyle);

		} else {
			this.#drawPolygon(g, this.shape.polygon);
			for (const hole of this.shape.holes) this.#drawPolygon(g, hole);
		}
	}

	#redrawFade() {
		if (this.#fadeGraphics) {
			canvas.blurFilters.delete(this.#fadeGraphics.filters[0]);
			this.removeChild(this.#fadeGraphics);
		}
		if (this.#fadeMask) this.removeChild(this.#fadeMask);

		if ((this.terrainType.lineFadeDistance ?? 0) <= 0 || this.terrainType.lineFadeOpacity <= 0) return;

		// Graphics
		const g = new PIXI.Graphics();
		this.#fadeGraphics = this.addChild(g);
		g.zIndex = 10;

		g.lineStyle({
			width: 48 * this.terrainType.lineFadeDistance,
			color: Color.from(this.terrainType.lineFadeColor ?? "#000000"),
			alpha: this.terrainType.lineFadeOpacity ?? 1,
			alignment: 0
		});

		this.#drawPolygon(g, this.shape.polygon);
		for (const hole of this.shape.holes)
			this.#drawPolygon(g, hole);

		// Use canvas.createBlurFilter so that Foundry can track it and update the strength as the user zooms in and
		// out of the scene. Also use a higher blur quality for this as this blur is larger than most others.
		g.filters = [canvas.createBlurFilter(60 * this.terrainType.lineFadeDistance, CONFIG.Canvas.blurQuality * 2)];

		// Mask
		const mask = new PIXI.Graphics();
		this.#fadeMask = this.addChild(mask);

		mask.beginFill(0x000000);

		this.#drawPolygon(mask, this.shape.polygon);
		for (const hole of this.shape.holes) {
			mask.beginHole();
			this.#drawPolygon(mask, hole);
			mask.endHole();
		}

		g.mask = mask;
	}

	async #redrawFill() {
		if (this.#fillGraphics) this.removeChild(this.#fillGraphics);

		const g = new PIXI.Graphics();
		this.#fillGraphics = this.addChild(g);
		g.zIndex = 0;

		await this.#setFillStyleFromTerrainType(g);

		this.#drawPolygon(g, this.shape.polygon);

		for (const hole of this.shape.holes) {
			g.beginHole();
			this.#drawPolygon(g, hole);
			g.endHole();
		}
	}

	_redrawLabel() {
		if (this.#label) this.removeChild(this.#label);

		const smartPlacement = game.settings.get(moduleName, settingNames.smartLabelPlacement);
		const allowRotation = this.terrainType.textRotation;
		const textStyle = this.#getTextStyle();
		const text = getLabelText(this.shape, this.terrainType);

		const label = new PreciseText(text, textStyle);
		this.#label = this.addChild(label);

		// Create the label - with this we can get the width and height
		label.zIndex = 30;
		label.anchor.set(0.5);

		/** Sets the position of the label so that it's center is at the given positions. */
		const setLabelPosition = (x, y, rotated) => {
			label.x = x;
			label.y = y;
			label.rotation = rotated
				? (x < canvas.dimensions.width / 2 ? -1 : 1) * Math.PI / 2
				: 0;
		};

		const allEdges = this.shape.polygon.edges.concat(this.shape.holes.flatMap(h => h.edges));

		/** Tests that if the label was position centrally at the given point, if it fits in the shape entirely. */
		const testLabelPosition = (x, y, rotated = false) => {
			const testEdge = rotated
				? new LineSegment(new Point(x, y - (label.width / 2)), new Point(x, y + (label.width / 2)))
				: new LineSegment(new Point(x - (label.width / 2), y), new Point(x + (label.width / 2), y));

			return this.shape.containsPoint(x, y) && allEdges.every(e => !e.intersectsAt(testEdge));
		};

		// If the label was to be positioned at the centroid of the polygon, and it was to entirely fit there, OR smart
		// positioning is disabled, then position it at the centroid.
		if (!smartPlacement || testLabelPosition(...this.shape.polygon.centroid, false)) {
			setLabelPosition(...this.shape.polygon.centroid);
			return label;
		}

		// If we can rotate the text, then check if rotating it 90 degrees at the centroid would allow it to fit entirely.
		if (allowRotation && testLabelPosition(...this.shape.polygon.centroid, true)) {
			setLabelPosition(...this.shape.polygon.centroid, true);
			return label;
		}

		// If the points fall outside of the polygon, we'll pick a few rays and find the widest and place the label there.
		// On square or hex row grids, we position it to the center of the cells (hex columns have alternating Xs, so don't)
		/** @type {number[]} */
		const testPoints = [...new Set(labelPositionAnchors
			.map(y => (y * this.shape.polygon.boundingBox.h) + this.shape.polygon.boundingBox.y1)
			.map(y => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENR, CONST.GRID_TYPES.HEXODDR].includes(canvas.grid.type)
				? canvas.grid.getCenterPoint({ x: this.shape.polygon.boundingBox.xMid, y }).y
				: y))];

		let widestPoint = { y: 0, x: 0, width: -Infinity };
		for (const y of testPoints) {
			/** @type {number[]} */
			const intersections = this.shape.polygon.edges
				.map(e => e.intersectsYAt(y))
				.concat(this.shape.holes.flatMap(h => h.edges.flatMap(e => e.intersectsYAt(y))))
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
				.map(x => (x * this.shape.polygon.boundingBox.w) + this.shape.polygon.boundingBox.x1)
				.map(x => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(canvas.grid.type)
					? canvas.grid.getCenterPoint({ x, y: this.shape.polygon.boundingBox.yMid }).x
					: x))];

			let tallestPoint = { y: 0, x: 0, height: -Infinity };
			for (const x of testPoints) {
				/** @type {number[]} */
				const intersections = this.shape.polygon.edges
					.map(e => e.intersectsXAt(x))
					.concat(this.shape.holes.flatMap(h => h.edges.flatMap(e => e.intersectsXAt(x))))
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

	// ---------------- //
	// Graphics styling //
	// ---------------- //
	async #setFillStyleFromTerrainType(graphics) {
		const color = Color.from(this.terrainType.fillColor ?? "#000000");

		if (this.terrainType.fillType === CONST.DRAWING_FILL_TYPES.NONE) {
			graphics.beginFill(0x000000, 0);

		} else if (this.terrainType.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && this.terrainType.fillTexture?.length) {
			const { x: xOffset, y: yOffset } = this.terrainType.fillTextureOffset;
			const { x: xScale, y: yScale } = this.terrainType.fillTextureScale;
			const matrix = new PIXI.Matrix(xScale / 100, 0, 0, yScale / 100, xOffset, yOffset);

			graphics.beginTextureFill({
				texture: await this.#parent._terrainTextures.get(this.shape.terrainTypeId),
				color,
				alpha: this.terrainType.fillOpacity,
				matrix
			});

		} else {
			graphics.beginFill(color, this.terrainType.fillOpacity ?? 0.4);
		}
	}

	#getLineStyleFromTerrainType() {
		return {
			width: this.terrainType.lineType === lineTypes.none ? 0 : this.terrainType.lineWidth ?? 0,
			color: Color.from(this.terrainType.lineColor ?? "#000000"),
			alpha: this.terrainType.lineOpacity ?? 1,
			alignment: 0
		};
	}

	/** @returns {PIXI.TextStyle} */
	#getTextStyle() {
		const style = CONFIG.canvasTextStyle.clone();

		const color = Color.from(this.terrainType.textColor ?? 0xFFFFFF);
		const autoStrokeColor = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;

		style.fontFamily = this.terrainType.font ?? CONFIG.defaultFontFamily;
		style.fontSize = this.terrainType.textSize;

		style.fill = color;

		style.strokeThickness = this.terrainType.textStrokeThickness;
		style.stroke = this.terrainType.textStrokeColor?.length
			? Color.from(this.terrainType.textStrokeColor)
			: autoStrokeColor;

		style.dropShadow = this.terrainType.textShadowAmount > 0;
		style.dropShadowBlur = this.terrainType.textShadowAmount;
		style.dropShadowColor = this.terrainType.textShadowColor?.length
			? Color.from(this.terrainType.textShadowColor)
			: autoStrokeColor;
		style.dropShadowAlpha = this.terrainType.textShadowOpacity;

		return style;
	}

	// ------- //
	// Helpers //
	// ------- //
	/** @param {Polygon} polygon */
	#drawPolygon(graphics, polygon) {
		graphics.moveTo(polygon.vertices.at(-1).x, polygon.vertices.at(-1).y);
		for (let i = 0; i < polygon.vertices.length; i++) {
			graphics.lineTo(polygon.vertices[i].x, polygon.vertices[i].y);
		}
		graphics.closePath();

		graphics.endFill();
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
