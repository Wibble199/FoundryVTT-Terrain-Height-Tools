/** @import { TerrainShape } from "../../geometry/terrain-shape.mjs"; */
/** @import { TerrainType } from "../../stores/terrain-types.mjs" */
/** @import { Signal } from "@preact/signals-core" */
import { computed, signal } from "@preact/signals-core";
import { sceneControls } from "../../config/controls.mjs";
import { showZonesAboveNonZones$, terrainLayerAboveTilesDefault$ } from "../../config/settings.mjs";
import { heightMapProviderId, tools } from "../../consts.mjs";
import { cursorWorldPosition$, invisibleTerrainTypes$, sceneRenderAboveTilesChoice$ } from "../../stores/canvas.mjs";
import { allTerrainShapes$ } from "../../stores/terrain-manager.mjs";
import { getTerrainType, terrainTypes$ } from "../../stores/terrain-types.mjs";
import { debug } from "../../utils/log.mjs";
import { abortableSubscribe } from "../../utils/signal-utils.mjs";
import { TerrainShapeGraphic } from "./terrain-shape-graphic.mjs";

/**
 * Layer for rendering terrain shapes to the canvas.
 */
export class TerrainHeightGraphicsLayer extends CanvasLayer {

	/** @type {Map<string, Map<TerrainShape, TerrainShapeGraphic>>} */
	#shapeGraphics = new Map();

	/** @type {Signal<PIXI.Sprite | null>} */
	_cursorRadiusMask$ = signal(null);

	/** @type {Signal<boolean>} */
	_isEditLayerActive$ = signal(false);

	/** @type {Signal<boolean>} */
	#isHighlightingObjects$ = signal(false);

	/** @type {Map<string, Promise<PIXI.Texture>>} */
	_terrainTextures = new Map();

	// TODO: TEMP
	#maskRadius$ = signal(true);

	#showOnTokenLayer$ = signal(true);

	#cursorRadiusMask;

	/** @type {AbortController} */
	#tearDownController;

	#graphicSortLayer$ = computed(() => {
		// Note that during the v11 -> v12 migration, I made the mistake of getting this setting backwards, so when this
		// value is TRUE that actually means that the terrain layer should be rendered BELOW the tiles.
		// The UI labels have been corrected so that users have the expected behaviour, but the name of the flags and
		// settings have not been changed so that users do not have to re-do their config.
		const renderBelowTiles = sceneRenderAboveTilesChoice$.value ?? terrainLayerAboveTilesDefault$.value;
		return renderBelowTiles ? 490 : 510;
	});

	constructor() {
		super();
		this.eventMode = "static";

		Hooks.on("highlightObjects", this._onHighlightObjects.bind(this));
	}

	/** @returns {TerrainHeightGraphicsLayer | undefined} */
	static get current() {
		return canvas.terrainHeightToolsGraphicsLayer;
	}

	get #allShapeGraphics() {
		return [...this.#shapeGraphics]
			.flatMap(([, graphics]) => [...graphics])
			.flatMap(([, graphic]) => graphic);
	}

	/** @override */
	_draw() {
		this.#tearDownController = new AbortController();
		const tearDownSignal = this.#tearDownController.signal;

		// When terrain types are changed, reload textures and redraw all the shapes
		abortableSubscribe(terrainTypes$, terrainTypes => {
			this._reloadTextures(terrainTypes);
			this._redrawShapes(allTerrainShapes$.value);
		}, tearDownSignal);

		// As shapes are added and removed to the master list, add and remove them from the scene (saves doing a full
		// redraw of the entire scene when small changes are made)
		allTerrainShapes$.subscribe({
			add: this._addShapes.bind(this),
			remove: this._removeShapes.bind(this)
		}, { signal: tearDownSignal });

		// When 'render above tiles' changes, set the sort layer of all graphics
		abortableSubscribe(this.#graphicSortLayer$, sortLayer => {
			for (const graphic of this.#allShapeGraphics)
				graphic.sortLayer = sortLayer;
			canvas.primary.sortChildren();
		}, tearDownSignal);

		// When 'show zones above non-zones' changes, set the sort of all graphics
		abortableSubscribe(showZonesAboveNonZones$, showZonesAboveNonZones => {
			for (const graphic of this.#allShapeGraphics) {
				graphic.sort = graphic.terrainType.usesHeight
					? graphic.shape.top
					: showZonesAboveNonZones ? Number.MAX_SAFE_INTEGER : -1;
			}
			canvas.primary.sortChildren();
		}, tearDownSignal);

		this.on("globalpointermove", this._updateCursorPosition);
	}

	/** @override */
	_tearDown() {
		this.#tearDownController.abort();
		this._clearShapes();
		this.off("globalpointermove", this._updateCursorPosition);
	}

	_updateCursorPosition = event => {
		cursorWorldPosition$.value = this.toLocal(event.data.global);
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
		this._addShapes(terrainData);
		this._updateShapeMasks();
		this._updateShapesVisibility({ animate: false });
	}

	/** @param {TerrainShape[]} newShapes */
	async _addShapes(newShapes) {
		for (const shape of newShapes) {
			const terrainType = getTerrainType(shape.terrainTypeId);
			if (!terrainType) continue;

			let providerGraphics = this.#shapeGraphics.get(shape._providerId);
			if (!providerGraphics) {
				providerGraphics = new Map();
				this.#shapeGraphics.set(shape._providerId, providerGraphics);
			}

			const shapeGraphic = new TerrainShapeGraphic(this, shape);
			shapeGraphic.sortLayer = this.#graphicSortLayer$.value;
			shapeGraphic.sort = (terrainType.usesHeight ? 1 : 0) * (showZonesAboveNonZones$.value ? -1 : 0);
			providerGraphics.set(shape, shapeGraphic);
			canvas.primary.addChild(shapeGraphic);
		}
	}

	/** @param {TerrainShape[]} removedShapes */
	async _removeShapes(removedShapes) {
		for (const shape of removedShapes) {
			const providerGraphics = this.#shapeGraphics.get(shape._providerId);
			const graphic = providerGraphics?.get(shape);
			if (!graphic) continue;

			providerGraphics.delete(shape);
			canvas.primary.removeChild(graphic);
		}
	}

	_clearShapes() {
		for (const graphic of this.#allShapeGraphics) {
			canvas.primary.removeChild(graphic);
		}
		this.#shapeGraphics.clear();
	}

	/** @param {TerrainType[]} terrainTypes */
	_reloadTextures(terrainTypes) {
		this._terrainTextures = new Map(terrainTypes
			.filter(type => type.fillTexture?.length)
			.map(type => [type.id, loadTexture(type.fillTexture)]));
	}

	/**
	 * @param {Object} [options]
	 * @param {boolean} [options.animate]
	*/
	async _updateShapesVisibility({ animate = true } = {}) {
		return;
		const invisibleTerrainTypes = invisibleTerrainTypes$.value;

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
		// TODO:
		return;

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
	};

	_onHighlightObjects(active) {
		// When using the "highlight objects" keybind, if the user has the radius option enabled and we're on the token
		// layer, show the entire height map
		this.#isHighlightingObjects$.value = canvas.activeLayer.name === "TokenLayer" && active;
	}
}
