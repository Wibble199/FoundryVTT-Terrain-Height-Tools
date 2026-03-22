/** @import { ReadonlySignal } from "@preact/signals-core" */
/** @import { PointLike } from "../../../../geometry/point.mjs" */
import { signal } from "@preact/signals-core";
import { drawingModeTypes } from "../../../../consts.mjs";
import { getGridCellPolygon, polygonsFromGridCells } from "../../../../utils/grid-utils.mjs";
import { drawDashedPath } from "../../../../utils/pixi-utils.mjs";
import { AbstractEditorTool } from "./abstract-editor-tool.mjs";

/**
 * Base class from with tools that require the user to draw a polygon to use can extend from.
 */
export class AbstractPolygonEditorTool extends AbstractEditorTool {

	/** @type {PIXI.Graphics} */
	#previewGraphics;

	/** @type {AbstractDrawingMode | undefined} */
	#drawingMode;

	/** @type {ReadonlySignal<boolean>} */
	_canDraw = signal(true);

	#cleanupController;

	#drawingModeTypesClasses = {
		[drawingModeTypes.gridCells]: GridCellDrawingMode,
		[drawingModeTypes.rectangle]: RectangleDrawingMode,
		[drawingModeTypes.ellipse]: EllipseDrawingMode,
		[drawingModeTypes.customPoly]: CustomPolygonDrawingMode
	};

	constructor() {
		super();

		this.#previewGraphics = canvas.interface.addChild(new PIXI.Graphics());

		this.#cleanupController = new AbortController();
	}

	get _cleanupSignal() {
		return this.#cleanupController.signal;
	}

	/** @param {drawingModeTypes} modeType */
	_selectDrawingMode(modeType) {
		const modeTypeClass = this.#drawingModeTypesClasses[modeType];
		if (modeTypeClass) {
			this.#previewGraphics.clear();
			this.#drawingMode = new modeTypeClass();
			this.#drawingMode._tool = this;
			this.#drawingMode._previewGraphics = this.#previewGraphics;
			this.#drawingMode._configurePreviewLine = () => this._configurePreviewLine(this.#previewGraphics);
			this.#drawingMode._configurePreviewFill = () => this._configurePreviewFill(this.#previewGraphics);
			this.#drawingMode._complete = this._use.bind(this);
		}
	}

	/** @override */
	_onMouseDownLeft(x, y) {
		if (this._canDraw.value)
			this.#drawingMode?._onMouseDownLeft?.(x, y);
	}

	/** @override */
	_onMouseUpLeft(x, y) {
		if (this._canDraw.value)
			this.#drawingMode?._onMouseUpLeft?.(x, y);
	}

	/** @override */
	_onMouseMove(x, y) {
		if (this._canDraw.value)
			this.#drawingMode?._onMouseMove?.(x, y);
	}

	/** @override */
	_onMouseDownRight(x, y) {
		if (this._canDraw.value)
			this.#drawingMode?._onMouseDownRight?.(x, y);
	}

	/** @override */
	_cleanup() {
		super._cleanup();
		canvas.interface.removeChild(this.#previewGraphics);
		this.#cleanupController.abort();
	}

	/**
	 * Called before rendering the preview for a polygon and should be used to configure the PIXI.Graphics instance to
	 * have the desired line style.
	 * @param {PIXI.Graphics} graphics
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	_configurePreviewLine(graphics) {
	}

	/**
	 * Called before rendering the preview for a polygon and should be used to configure the PIXI.Graphics instance to
	 * have the desired fill style.
	 * @param {PIXI.Graphics} graphics
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	_configurePreviewFill(graphics) {
	}

	/**
	 * Called with the polygons when the user completes their action.
	 * May be called with multiple polygons if the user has drawn a self-intersecting shape - in this case the polygon
	 * will be simplified using ClipperLib.
	 * @param {{ polygon: PointLike[]; holes?: PointLike[][] }[]} polygons
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	_use(polygons) {
	}
}

// Each drawing mode is implemented within it's own class.
// This allows easily keeping the state and behaviour separate from other tools, instead of having lots of fields and
// conditionals within the main region editor tool class.

class AbstractDrawingMode {

	/**
	 * Graphics instance that can be used for drawing the preview.
	 * @type {PIXI.Graphics}
	 */
	_previewGraphics;

	/** @type {AbstractPolygonEditorTool} */
	_tool;

	/**
	 * Function which can be called by this class to configure the fill for the _previewGraphics instance.
	 * This is set by the AbstractRegionEditorTool, and does not need implementing in derived classes.
	 * @type {() => void}
	 */
	_configurePreviewLine;

	/**
	 * Function which can be called by this class to configure the fill for the _previewGraphics instance.
	 * This is set by the AbstractRegionEditorTool, and does not need implementing in derived classes.
	 * @type {() => void}
	 */
	_configurePreviewFill;

	/**
	 * Function that should be called when the user has finished drawing the polygon.
	 * This is set by the AbstractRegionEditorTool, and does not need implementing in derived classes.
	 * @type {(polygons: { polygon: PointLike[]; holes?: PointLike[][] }[]) => void}
	 */
	_complete;

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseDownLeft(x, y) {}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseUpLeft(x, y) {}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseMove(x, y) {}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseDownRight(x, y) {}
}

/**
 * Drawing mode for selecting grid cells.
 */
class GridCellDrawingMode extends AbstractDrawingMode {

	/** @type {Set<string>} */
	#pendingCells = new Set();

	#isDrawing = false;

	/** @override */
	_onMouseDownLeft(x, y) {
		this.#isDrawing = true;
		this.#highlightCell(x, y);
	}

	/** @override */
	_onMouseMove(x, y) {
		if (this.#isDrawing)
			this.#highlightCell(x, y);
	}

	/** @override */
	_onMouseUpLeft() {
		if (!this.#isDrawing) return;

		this.#isDrawing = false;
		const selectedCells = [...this.#pendingCells].map(c => c.split("|").map(Number));
		this._previewGraphics.clear();
		this.#pendingCells.clear();
		this._complete(polygonsFromGridCells(selectedCells, canvas.grid));
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	#highlightCell(x, y) {
		if (!this.#isDrawing) return;

		const { i, j } = canvas.grid.getOffset({ x, y });
		const cellKey = `${i}|${j}`;
		if (this.#pendingCells.has(cellKey)) return;

		this.#pendingCells.add(cellKey);
		this._configurePreviewFill();
		this._previewGraphics.drawPolygon(getGridCellPolygon(i, j)).endFill();
	}
}

/**
 * Drawing mode for creating a rectangle/square.
 */
class RectangleDrawingMode extends AbstractDrawingMode {

	static minRectangleSize = 10;

	/** @type {[number, number] | null} */
	#startPosition = null;

	_onMouseDownLeft(x, y) {
		this.#startPosition = [x, y];
	}

	_onMouseUpLeft(x, y) {
		if (!this.#startPosition) return;

		const { x1, y1, x2, y2, w, h } = this.#getRect(x, y);
		if ((w >= RectangleDrawingMode.minRectangleSize || h >= RectangleDrawingMode.minRectangleSize) && w > 0 && h > 0) {
			this._complete([
				{
					polygon: [
						[x1, y1],
						[x2, y1],
						[x2, y2],
						[x1, y2]
					]
				}
			]);
		}

		this.#startPosition = null;
		this._previewGraphics.clear();
	}

	_onMouseMove(x, y) {
		if (this.#startPosition)
			this.#updatePreview(x, y);
	}

	_onMouseDownRight() {
		// Right click cancels
		this.#startPosition = null;
		this._previewGraphics.clear();
	}

	/**
	 * @param {number} mouseX Current mouse X coordinate
	 * @param {number} mouseY Current mouse Y coordinate
	 */
	#updatePreview(mouseX, mouseY) {
		this._previewGraphics.clear();

		const { x1, y1, w, h } = this.#getRect(mouseX, mouseY);
		if (w >= RectangleDrawingMode.minRectangleSize || h >= RectangleDrawingMode.minRectangleSize) {
			this._configurePreviewFill();
			this._configurePreviewLine();
			this._previewGraphics.drawRect(x1, y1, w, h);
		}
	}

	/**
	 * @param {number} mouseX Current mouse X coordinate
	 * @param {number} mouseY Current mouse Y coordinate
	 */
	#getRect(mouseX, mouseY) {
		const x1 = Math.min(mouseX, this.#startPosition[0]);
		const y1 = Math.min(mouseY, this.#startPosition[1]);
		const x2 = Math.max(mouseX, this.#startPosition[0]);
		const y2 = Math.max(mouseY, this.#startPosition[1]);
		return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
	}
}

/**
 * Drawing mode for creating an ellipse/circle.
 */
class EllipseDrawingMode extends AbstractDrawingMode {

	static minEllipseRadius = 5;

	/** @type {[number, number] | null} */
	#startPosition = null;

	_onMouseDownLeft(x, y) {
		this.#startPosition = [x, y];
	}

	_onMouseUpLeft(x, y) {
		if (!this.#startPosition) return;

		const { cx, cy, rx, ry } = this.#getEllipse(x, y);
		const density = PIXI.Circle.approximateVertexDensity((rx + ry) / 2);

		if (rx >= EllipseDrawingMode.minEllipseRadius && ry >= EllipseDrawingMode.minEllipseRadius) {
			this._complete([
				{
					polygon: Array.from({ length: density }, (_, i) => {
						const a = Math.PI * 2 * (i / density);
						return [(Math.cos(a) * rx) + cx, (Math.sin(a) * ry) + cy];
					})
				}
			]);
		}

		this.#startPosition = null;
		this._previewGraphics.clear();
	}

	_onMouseMove(x, y) {
		if (this.#startPosition)
			this.#updatePreview(x, y);
	}

	_onMouseDownRight() {
		// Right click cancels
		this.#startPosition = null;
		this._previewGraphics.clear();
	}

	/**
	 * @param {number} mouseX Current mouse X coordinate
	 * @param {number} mouseY Current mouse Y coordinate
	 */
	#updatePreview(mouseX, mouseY) {
		this._previewGraphics.clear();

		const { cx, cy, rx, ry } = this.#getEllipse(mouseX, mouseY);
		if (rx >= EllipseDrawingMode.minEllipseRadius && ry >= EllipseDrawingMode.minEllipseRadius) {
			this._configurePreviewFill();
			this._configurePreviewLine();
			this._previewGraphics.drawEllipse(cx, cy, rx, ry);
		}
	}

	/**
	 * @param {number} mouseX Current mouse X coordinate
	 * @param {number} mouseY Current mouse Y coordinate
	 */
	#getEllipse(mouseX, mouseY) {
		const cx = (mouseX + this.#startPosition[0]) / 2;
		const cy = (mouseY + this.#startPosition[1]) / 2;

		const rx = Math.abs(mouseX - this.#startPosition[0]) / 2;
		const ry = Math.abs(mouseY - this.#startPosition[1]) / 2;

		return { cx, cy, rx, ry };
	}
}

/**
 * Drawing mode for creating an arbitrary custom polygon.
 */
class CustomPolygonDrawingMode extends AbstractDrawingMode {

	#lastClickTime = 0;

	/** @type {[number, number][]} */
	#currentPoints = [];

	/** @override */
	_onMouseDownLeft(x, y) {
		// If the user is already drawing a polygon, then double clicking will end the polygon
		if ((Date.now() - this.#lastClickTime) < 250 && this.#currentPoints.length >= 3) {
			this._complete(ClipperLib.Clipper.SimplifyPolygon(
				this.#currentPoints.map(p => new ClipperLib.IntPoint(p[0], p[1])),
				ClipperLib.PolyFillType.pftNonZero
			).map(polygon => ({ polygon })));
			this.#currentPoints = [];

		} else {
			// Otherwise, then single clicking will add a new point to the polygon
			this.#currentPoints.push([Math.round(x), Math.round(y)]);
		}

		this.#lastClickTime = Date.now();
		this.#updatePreview(x, y);
	}

	/** @override */
	_onMouseMove(x, y) {
		// If the user is already drawing a polygon, just update the preview
		if (this.#currentPoints.length > 0) {
			this.#updatePreview(x, y);
			return;
		}
	}

	/** @override */
	_onMouseDownRight(x, y) {
		if (this.#currentPoints.length > 0) {
			this.#currentPoints.pop();
			this.#updatePreview(x, y);
		}
	}

	/**
	 * @param {number} mouseX Current mouse X coordinate
	 * @param {number} mouseY Current mouse Y coordinate
	 */
	#updatePreview(mouseX, mouseY) {
		this._previewGraphics.clear();

		if (this.#currentPoints.length === 0) return;

		// Draw fill (needs to be done before the dashed preview line)
		// We need to simplify the polygon first since PIXI uses triangulation when drawing, which is not how our polys
		// behave.
		if (this.#currentPoints.length > 1) {
			const simplifiedPolygons = ClipperLib.Clipper.SimplifyPolygon([
				...this.#currentPoints.map(p => new ClipperLib.IntPoint(p[0], p[1])),
				new ClipperLib.IntPoint(Math.round(mouseX), Math.round(mouseY))
			], ClipperLib.PolyFillType.pftNonZero);

			for (const simplified of simplifiedPolygons) {
				this._configurePreviewFill();
				this._previewGraphics.moveTo(simplified[0].X, simplified[0].Y);
				for (let i = 1; i < simplified.length; i++)
					this._previewGraphics.lineTo(simplified[i].X, simplified[i].Y);
				this._previewGraphics.endFill();
			}

		}

		this._configurePreviewLine();

		// Draw main (solid) border
		this._previewGraphics.moveTo(...this.#currentPoints[0]);
		for (let i = 1; i < this.#currentPoints.length; i++)
			this._previewGraphics.lineTo(...this.#currentPoints[i]);

		// Draw dashed preview line
		drawDashedPath(this._previewGraphics, [
			this.#currentPoints.at(-1),
			[mouseX, mouseY],
			this.#currentPoints.length > 1 && this.#currentPoints[0] // don't double-draw line if only one
		].filter(Boolean));
	}
}
