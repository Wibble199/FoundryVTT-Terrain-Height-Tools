import { drawDashedPath } from "../../../../utils/pixi-utils.mjs";
import { AbstractEditorTool } from "./abstract-editor-tool.mjs";

const minDragDistance = 100;

/**
 * Base class from with tools that require the user to draw a polygon to use can extend from.
 */
export class AbstractPolygonEditorTool extends AbstractEditorTool {

	/** @type {[number, number] | undefined} */
	#dragInitialPoint;

	#lastClickTime = 0;

	/** @type {[number, number][]} */
	#currentPoints = [];

	/** @type {GridHighlight} */
	#graphics;

	constructor() {
		super();

		this.#graphics = canvas.interface.addChild(new PIXI.Graphics());
	}

	/** @override */
	_onMouseDownLeft(x, y) {
		// If the user is not drawing a polygon, they need to click and drag to start one
		// (I find this weird, but it's to have the same behaviour as Foundry's polygon drawing tool)
		if (this.#currentPoints.length === 0) {
			this.#dragInitialPoint = [Math.round(x), Math.round(y)];
			return;
		}

		// If the user is already drawing a polygon, then double clicking will end the polygon
		if ((Date.now() - this.#lastClickTime) < 250) {
			if (this.#currentPoints.length < 3) {
				ui.notifications.error("Polygon must have 3 or more vertices."); // TODO: localize
			} else {
				this._use(ClipperLib.Clipper.SimplifyPolygon(
					this.#currentPoints.map(p => new ClipperLib.IntPoint(p[0], p[1])),
					ClipperLib.PolyFillType.pftNonZero
				));
			}

			this.#currentPoints = [];

		} else {
			// Otherwise, if the user is drawing a polygon, then single clicking will add a new point to that polygon
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

		// If the user is not already drawing a polygon, but their mouse is down, see how far it has moved. If it has
		// moved far enough, then start drawing one
		if (!this.#dragInitialPoint) return;

		const dx = this.#dragInitialPoint[0] - x;
		const dy = this.#dragInitialPoint[1] - y;
		const r2 = (dx * dx) + (dy * dy);

		if (r2 > minDragDistance && this._canDraw()) {
			this.#currentPoints.push(this.#dragInitialPoint);
			this.#dragInitialPoint = undefined;
			this.#updatePreview(x, y);
		}
	}

	/** @override */
	_onMouseUpLeft(x, y) {
		// If there is only one point currently (i.e. we're still dragging the initial edge), then a mouse release will
		// create the next point.
		if (this.#currentPoints.length === 1) {
			this.#currentPoints.push([Math.round(x), Math.round(y)]);
			this.#updatePreview(x, y);
		}

		this.#dragInitialPoint = undefined;
	}

	/** @override */
	_onMouseDownRight(x, y) {
		if (this.#currentPoints.length > 0) {
			this.#currentPoints.pop();
			this.#updatePreview(x, y);
		}
	}

	/** @override */
	_cleanup() {
		canvas.interface.removeChild(this.#graphics);
	}

	/**
	 * @param {number} mouseX Current mouse X coordinate
	 * @param {number} mouseY Current mouse Y coordinate
	 */
	#updatePreview(mouseX, mouseY) {
		this.#graphics.clear();

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
				this._configurePreviewFill(this.#graphics);
				this.#graphics.moveTo(simplified[0].X, simplified[0].Y);
				for (let i = 1; i < simplified.length; i++)
					this.#graphics.lineTo(simplified[i].X, simplified[i].Y);
				this.#graphics.endFill();
			}

		}

		this._configurePreviewLine(this.#graphics);

		// Draw main (solid) border
		this.#graphics.moveTo(...this.#currentPoints[0]);
		for (let i = 1; i < this.#currentPoints.length; i++)
			this.#graphics.lineTo(...this.#currentPoints[i]);

		// Draw dashed preview line
		drawDashedPath(this.#graphics, [
			this.#currentPoints.at(-1),
			[mouseX, mouseY],
			this.#currentPoints.length > 1 && this.#currentPoints[0] // don't double-draw line if only one
		].filter(Boolean));
	}

	/**
	 * Whether it is valid to draw a polygon.
	 * @protected
	 */
	_canDraw() {
		return true;
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
	 * @param {{ X: number; Y: number; }[][]} polygons
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	_use(polygons) {
	}
}
