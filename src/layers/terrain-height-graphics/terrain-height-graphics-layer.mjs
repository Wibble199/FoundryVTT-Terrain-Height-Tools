/** @import { TerrainShape } from "../../geometry/terrain-shape.mjs"; */
import { sceneControls } from "../../config/controls.mjs";
import { heightMapProviderId, tools } from "../../consts.mjs";
import { allTerrainShapes$ } from "../../stores/terrain-manager.mjs";
import { toSceneUnits } from "../../utils/grid-utils.mjs";
import { debug } from "../../utils/log.mjs";
import { prettyFraction } from "../../utils/misc-utils.mjs";
import { join, Signal } from "../../utils/signal.mjs";
import { getInvisibleSceneTerrainTypes, getTerrainType, terrainTypes$ } from '../../utils/terrain-types.mjs';
import { TerrainShapeGraphic } from "./terrain-shape-graphic.mjs";

/**
 * The positions relative to the shape that the label placement algorithm will test, both horizontal and vertical.
 * Note that the order represents the order that ties are resolved, so in this case the middle will be prefered in ties.
 */
export const labelPositionAnchors = [0.5, 0.4, 0.6, 0.2, 0.8];

/**
 * Layer for rendering terrain shapes to the canvas.
 */
export class TerrainHeightGraphicsLayer extends CanvasLayer {

	/** @type {Map<string, Map<TerrainShape, TerrainShapeGraphic>>} */
	#shapeGraphics = new Map();

	/** @type {Signal<PIXI.Sprite | null>} */
	_cursorRadiusMask$ = new Signal(null);

	// Visibility
	/** @type {Signal<boolean>} */
	_isEditLayerActive$ = new Signal(false);

	/** @type {Signal<boolean>} */
	#isHighlightingObjects$ = new Signal(false);

	/** @type {Map<string, Promise<PIXI.Texture>>} */
	_terrainTextures = new Map();

	/** @type {(() => void)[]} */
	#subscriptions = [];

	// TODO: TEMP
	#maskRadius$ = new Signal(true);
	#showOnTokenLayer$ = new Signal(true);
	#cursorRadiusMask;

	constructor() {
		super();
		this.eventMode = "static";

		Hooks.on("highlightObjects", this._onHighlightObjects.bind(this));
	}

	/** @returns {TerrainHeightGraphicsLayer} */
	static get current() {
		return canvas.terrainHeightGraphicsLayer;
	}

	get #allShapeGraphics() {
		return [...this.#shapeGraphics]
			.flatMap(([, graphics]) => [...graphics])
			.flatMap(([, graphic]) => graphic);
	}

	/** @override */
	_draw() {
		this._redrawShapes(allTerrainShapes$.value);

		this.#subscriptions.push(
			join(this._updateShapeMasks.bind(this), this._isEditLayerActive$, this.#isHighlightingObjects$, this.#maskRadius$),
			join(this._updateShapesVisibility.bind(this), this._isEditLayerActive$, this.#showOnTokenLayer$, sceneControls.activeTool$),
			allTerrainShapes$.subscribe({ add: this._addShape.bind(this), remove: this._removeShape.bind(this) }),
			terrainTypes$.subscribe(this._reloadTextures.bind(this), true)
		);

		this.on("globalpointermove", this._updateTerrainStackViewer);
	}

	/** @override */
	_tearDown() {
		this._clearShapes();
		this.#subscriptions.forEach(unsubscribe => unsubscribe());
		this.#subscriptions = [];

		this.off("globalpointermove", this._updateTerrainStackViewer);
		this.off("globalpointermove", this._updateCursorMaskPosition);
	}

	_updateTerrainStackViewer = event => {
		// TODO:
	};

	/**
	 * Redraws the graphics layer using the supplied height map data.
	 * @param {TerrainShape[]} terrainData
	 */
	_redrawShapes(terrainData) {
		// If there are no shapes on the map, just clear it and return
		if (terrainData.length === 0) {
			this._clearShapes();
			this._updateShapeMasks();
			return;
		}

		this._clearShapes();

		for (const { providerId, shapes } of terrainData) {
			/** @type {TerrainShapeGraphic[]} */
			const providerGraphics = [];
			this.#shapeGraphics.set(providerId, providerGraphics);

			for (const shape of shapes) {
				const terrainType = getTerrainType(shape.terrainTypeId);
				if (!terrainType || !shape.visible) continue;

				const shapeGraphic = new TerrainShapeGraphic(this, shape, terrainType);
				providerGraphics.push(shapeGraphic);
				canvas.primary.addChild(shapeGraphic);
			}
		}

		this._updateShapeMasks();
		this._updateShapesVisibility({ animate: false });
	}

	/** @param {TerrainShape[]} newShapes */
	async _addShape(newShapes) {
		// TODO: check if we need to turn on the cursor mask
	}

	/** @param {TerrainShape[]} removedShapes */
	async _removeShape(removedShapes) {
		// TODO: check if we need to turn off the cursor mask
	}

	_clearShapes() {
		for (const graphic of this.#allShapeGraphics) {
			graphic.destroy();
			canvas.primary.removeChild(graphic);
		}
		this.#shapeGraphics.clear();
	}

	/** @param {import("../../utils/terrain-types.mjs").TerrainType[]} terrainTypes */
	_reloadTextures(terrainTypes) {
		this._terrainTextures = new Map(terrainTypes
			.filter(type => type.fillTexture?.length)
			.map(type => [type.id, loadTexture(type.fillTexture)]));
	}

	/**
	 * @param {{ height: number; elevation: number; }} shape
	 * @param {import("../../utils/terrain-types.mjs").TerrainType} terrainStyle
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

		// If the THT editing layer is active (excluding the visibility tool), then we want to show all (and only) THT
		// shapes. I.E. don't include shapes from other providers.
		const showAllAndOnlyThtShapes = this._isEditLayerActive$.value && sceneControls.activeTool$.value !== tools.terrainVisibility;

		await Promise.all([...this.#shapeGraphics].flatMap(([providerId, graphics]) => graphics.map(s => s._setVisible(
			showAllAndOnlyThtShapes
				? providerId === heightMapProviderId

				// Shapes should be visible if THT is turned on for other layers or the terrain type is always visible
				// AND that terrain type is not hidden on this scene
				: (this.#showOnTokenLayer$.value || s._terrainType.isAlwaysVisible) &&
				!invisibleTerrainTypes.has(s._terrainType.id),
			animate
		))));
	}

	/**
	 * Updates the radius of the mask used to only show the height around the user's cursor.
	 */
	_updateShapeMasks() {
		// If the THT layer is active, or the user is clicking the highlight objects button, then always show the entire
		// map (radius = 0). Otherwise, use the configured value.
		let radius = this._isEditLayerActive$.value || this.#isHighlightingObjects$.value
			? 0
			: this.#maskRadius$.value;

		debug(`Updating terrain height layer graphics mask size to ${radius}`);

		// Remove previous mask
		this.#allShapeGraphics.forEach(shape => shape._setMask(null));
		if (this.#cursorRadiusMask) canvas.primary.removeChild(this.#cursorRadiusMask);
		this.off("globalpointermove", this._updateCursorMaskPosition);

		// Stop here if not applying a new mask. We are not applying a mask if:
		// - The radius is 0, i.e. no mask
		// - If there are no shapes; if there are no shapes to apply the mask to, it will appear as an actual white
		//   circle on the canvas.
		if (radius <= 0 || !this.#allShapeGraphics.some(s => s._canHaveMask)) return;

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
		this.#cursorRadiusMask = new PIXI.Sprite(texture);
		this.#cursorRadiusMask.anchor.set(0.5);
		canvas.primary.addChild(this.#cursorRadiusMask);

		// Get current mouse coordinates
		const pos = canvas.mousePosition;
		this.#cursorRadiusMask.position.set(pos.x, pos.y);

		// Set mask
		this.#allShapeGraphics.forEach(shape => shape._setMask(this.#cursorRadiusMask));
		this.on("globalpointermove", this._updateCursorMaskPosition);
	}

	_updateCursorMaskPosition = event => {
		const pos = this.toLocal(event.data.global);
		this.#cursorRadiusMask.position.set(pos.x, pos.y);
	}

	_onHighlightObjects(active) {
		// When using the "highlight objects" keybind, if the user has the radius option enabled and we're on the token
		// layer, show the entire height map
		if (canvas.activeLayer.name === "TokenLayer") {
			this.#isHighlightingObjects$.value = active;
		}
	}
}
