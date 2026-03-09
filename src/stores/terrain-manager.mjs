/** @import { TerrainShape } from "../geometry/terrain-shape.mjs"; */
import { ObservableSet } from "../utils/observable-set.mjs";

/**
 * @typedef {Object} TerrainProviderMeta
 * @property {string} id
 * @property {TerrainProvider} provider
 * @property {() => void} cleanup
 */

/** @type {Map<string, TerrainProviderMeta>} */
const terrainProviders = new Map();

/** @type {ObservableSet<TerrainShape>} */
export const allTerrainShapes$ = new ObservableSet();

/**
 * Gets all shapes on the canvas.
 * @param {Object} [options]
 * @param {string[]} [options.providerIds] If provided, only returns shapes for the specified terrain providers.
 * @returns {TerrainShape[]}
 */
export function getAllShapes({ providerIds } = {}) {
	const shapes = [];
	for (const [providerId, { provider }] of terrainProviders)
		if (!providerIds?.length || providerIds.includes(providerId))
			shapes.push(...provider.terrainShapes$.value);
	return shapes;
}

/**
 * Gets shapes that exist at the given point.
 * @param {number} x
 * @param {number} y
 * @param {Object} [options]
 * @param {string[]} [options.providerIds] If provided, only returns shapes for the specified terrain providers.
 * @returns {TerrainShape[]}
 */
export function getShapesAtPoint(x, y, { providerIds } = {}) {
	return getShapesByBounds(new PIXI.Rectangle(x, y, 0, 0), {
		providerIds,
		collisionTest: ({ t: shape }) => shape.containsPoint(x, y)
	});
}

/**
 * Gets shapes whose bounds overlap the given rectangle.
 * @param {PIXI.Rectangle} rect
 * @param {Object} [options]
 * @param {string[]} [options.providerIds] If provided, only returns shapes for the specified terrain providers.
 * @param {(entry: { r: PIXI.Rectangle; t: TerrainShape; }, rect: PIXI.Rectangle) => boolean} [options.collisionTest]
 */
export function getShapesByBounds(rect, { providerIds, collisionTest } = {}) {
	const shapes = [];
	for (const [providerId, { provider }] of terrainProviders) {
		if (providerIds?.length && !providerIds.includes(providerId)) continue;
		shapes.push(...provider.quadtree.getObjects(rect, { collisionTest }));
	}
	return shapes;
}

/**
 * Registers a new TerrainProvider, enabling it to provide terrain data to THT.
 * @param {string} providerId A unique ID for this provider.
 * @param {TerrainProvider} provider
 */
export function registerTerrainProvider(providerId, provider) {
	if (!(provider instanceof TerrainProvider))
		throw new Error("Expected provider to be an instance of TerrainProvider.");
	if (terrainProviders.has(providerId))
		throw new Error("A TerrainProvider with this ID has already been registered.");

	const cleanup = provider.terrainShapes$.subscribe({
		add: newShapes => {
			for (const shape of newShapes)
				shape._providerId = providerId;
			allTerrainShapes$.add(...newShapes);
		},
		remove: removedShapes => {
			allTerrainShapes$.delete(...removedShapes);
		}
	});

	allTerrainShapes$.add(...provider.terrainShapes$.value);

	terrainProviders.set(providerId, { id: providerId, provider, cleanup });
}

/**
 * Unregisters a previously-registered TerrainProvider.
 * @param {string | TerrainProvider} providerOrId The provider to unregister or it's ID.
 */
export function unregisterTerrainProvider(providerOrId) {
	const providerId = typeof providerOrId === "string"
		? providerOrId
		: [...terrainProviders.entries()].find(x => x[1].provider === providerOrId)?.[0];
	const providerMeta = terrainProviders.get(providerId);

	if (providerMeta === undefined)
		return;

	providerMeta.cleanup();

	allTerrainShapes$.delete(...providerMeta.provider.terrainShapes$.value);

	terrainProviders.delete(providerId);
}

export class TerrainProvider {

	/** @type {ObservableSet<TerrainShape>} */
	terrainShapes$ = new ObservableSet();

	quadtree = new CanvasQuadtree();

	#canvasReadyHookId;

	#canvasTearDownHookId;

	constructor() {
		this.#canvasReadyHookId = Hooks.on("canvasReady", () => this._canvasReady());
		this.#canvasTearDownHookId = Hooks.on("canvasTearDown", () => this._canvasTearDown());

		this.terrainShapes$.subscribe({
			add: shapes => {
				for (const shape of shapes)
					this.quadtree.insert({ r: shape.polygon.boundingRect, t: shape });
			},
			remove: shapes => {
				for (const shape of shapes)
					this.quadtree.remove(shape);
			}
		});
	}

	/**
	 * Adds a terrain shape to the provider.
	 * @param {...TerrainShape} shapes
	 */
	addShapes(...shapes) {
		this.terrainShapes$.add(...shapes);
	}

	/**
	 * Overwrites all the current shapes with the new given shapes.
	 * @param {TerrainShape[]} shapes
	 */
	setShapes(shapes) {
		this.terrainShapes$.value = shapes;
	}

	/**
	 * Removes a terrain shape from the provider.
	 * @param {...TerrainShape} shapes
	 */
	deleteShapes(...shapes) {
		this.terrainShapes$.delete(...shapes);
	}

	/**
	 * Removes all shapes from this provider.
	 */
	deleteAllShapes() {
		this.terrainShapes$.clear();
	}

	/**
	 * Hook handler for when the canvas is ready.
	 * @protected
	 */
	_canvasReady() {
		// When the canvas is ready, update the quadtree as the bounds of the scene may have changed.
		this.#rebuildQuadtree();
	}

	/**
	 * Hook handler for when the canvas is torn down.
	 * @protected
	 */
	_canvasTearDown() {}

	/**
	 * Clears and rebuilds the quadtree.
	 */
	#rebuildQuadtree() {
		this.quadtree.clear();
		for (const shape of this.terrainShapes$.value) {
			this.quadtree.insert({ r: shape.polygon.boundingRect, t: shape });
		}
	}

	destroy() {
		Hooks.off("canvasReady", this.#canvasReadyHookId);
		Hooks.off("canvasTearDown", this.#canvasTearDownHookId);
		this.terrainShapes$.unsubscribeAll();
	}
}
