/** @import { HeightMapShape } from "../geometry/height-map-shape.mjs"; */
import { Signal } from "../utils/signal.mjs";

/**
 * @typedef {(value: HeightMapShape[]) => void} TerrainProviderCallback
 */
/**
 * @typedef {Object} TerrainProvider
 * @property {(callback: TerrainProviderCallback) => void} addChangeListener
 * @property {(callback: TerrainProviderCallback) => void} removeChangeListener
 */
/**
 * @typedef {Object} TerrainProviderMeta
 * @property {string} id
 * @property {TerrainProvider} provider
 * @property {HeightMapShape[]} currentTerrain
 * @property {TerrainProviderCallback} callback
 */

/** @type {Map<string, TerrainProviderMeta>} */
const terrainProviders = new Map();

/** @type {Signal<{ providerId: string; shapes: HeightMapShape[]; }[]>} */
export const currentTerrain$ = new Signal([]);

/**
 * Updates the currentTerrain$ signal with the current terrain data from the providers.
 * Throttled so that rapid updates don't cause rapid re-renders.
 * @type {() => void}
 */
const updateCurrentTerrain = foundry.utils.throttle(() => {
	currentTerrain$.value = [...terrainProviders.values()].map(p => ({ providerId: p.id, shapes: [...p.currentTerrain] }));
}, 100);

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

	/** @type {TerrainProviderMeta} */
	const providerMeta = {
		id: providerId,
		provider,
		currentTerrain: []
	};

	terrainProviders.set(providerMeta.id, providerMeta);

	provider.addChangeListener(providerMeta.callback = newTerrainShapes => {
		providerMeta.currentTerrain = Array.isArray(newTerrainShapes) ? newTerrainShapes : [];
		updateCurrentTerrain();
	});
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

	providerMeta.provider.removeChangeListener(providerMeta.callback);
	terrainProviders.delete(providerId);
	updateCurrentTerrain();
}
