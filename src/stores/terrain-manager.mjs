/** @import { TerrainShape } from "../geometry/terrain-shape.mjs"; */

import { SetSignal } from "../utils/signal.mjs";

/**
 * @typedef {Object} TerrainProviderMeta
 * @property {string} id
 * @property {TerrainProvider} provider
 * @property {() => void} cleanup
 */

/** @type {Map<string, TerrainProviderMeta>} */
const terrainProviders = new Map();

/** @type {SetSignal<TerrainShape>} */
export const allTerrainShapes$ = new SetSignal();

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
 */
export function getShapesAtPoint(x, y, options) {
	return getShapesByBounds(new PIXI.Rectangle(x, y, 0, 0), options);
}

/**
 * Gets shapes whose bounds overlap the given rectangle.
 * @param {PIXI.Rectangle} rect
 * @param {Object} [options]
 * @param {string[]} [options.providerIds] If provided, only returns shapes for the specified terrain providers.
 */
export function getShapesByBounds(rect, { providerIds } = {}) {
	const shapes = [];
	for (const [providerId, { provider }] of terrainProviders) {
		if (providerIds?.length && !providerIds.includes(providerId)) continue;
		shapes.push(...provider.quadtree.getObjects(rect));
	}
	return shapes;
}

/**
 * Registers a new TerrainProvider, enabling it to provide terrain data to THT.
 * @param {string} providerId A unique ID for this provider.
 * @param {TerrainProvider} provider
 */
export function registerTerrainProvider(providerId, provider) {
	if (typeof provider.addChangeListener !== "function" && typeof provider.removeChangeListener !== "function")
		throw new Error("Expected provider to have `addChangeListener` and `removeChangeListener` functions.");
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

	allTerrainShapes$.remove(...providerMeta.provider.terrainShapes$.value);

	terrainProviders.delete(providerId);
}

export class TerrainProvider {

	/** @type {SetSignal<TerrainShape>} */
	terrainShapes$ = new SetSignal();

	quadtree = new CanvasQuadtree();

	#canvasReadyHookId;
	#canvasTearDownHookId;

	constructor() {
		this.#canvasReadyHookId = Hooks.on("canvasReady", () => this._canvasReady());
		this.#canvasTearDownHookId = Hooks.on("canvasTearDown", () => this._canvasTearDown());

		this.terrainShapes$.subscribe({
			add: shapes => {
				for (const shape of shapes)
					this.quadtree.insert({ r: shape.polygon.boundingRect, t: { shape } });
			},
			remove: shapes => {
				for (const shape of shapes)
					this.quadtree.remove(shape);
			}
		});
	}

	/**
	 * Adds a terrain shape to the provider.
	 * @param {TerrainShape} shape
	 */
	addShape(shape) {
		this.terrainShapes$.add(shape);
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
	 * @param {TerrainShape} shape
	 */
	deleteShape(shape) {
		this.terrainShapes$.delete(shape);
	}

	_canvasReady() {
		// When the canvas is ready, update the quadtree as the bounds of the scene may have changed.
		this.quadtree.clear();
		for (const shape of this.terrainShapes$.value) {
			this.quadtree.insert({ r: shape.polygon.boundingRect, t: shape });
		}
	}

	_canvasTearDown() {}

	destroy() {
		Hooks.off("canvasReady", this.#canvasReadyHookId);
		Hooks.off("canvasTearDown", this.#canvasTearDownHookId);
		this.terrainShapes$.unsubscribeAll();
	}
}
