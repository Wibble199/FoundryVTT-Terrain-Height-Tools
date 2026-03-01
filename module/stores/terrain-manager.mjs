/** @import { TerrainShape } from "../geometry/terrain-shape.mjs"; */
import { Signal } from "../utils/signal.mjs";

/** @typedef {(value: TerrainShape[]) => void} TerrainProviderCallback */

/**
 * @typedef {Object} TerrainProvider
 * @property {(callback: TerrainProviderCallback) => void} addChangeListener
 * @property {(callback: TerrainProviderCallback) => void} removeChangeListener
 */

/**
 * @typedef {Object} TerrainProviderMeta
 * @property {string} id
 * @property {TerrainProvider} provider
 * @property {TerrainShape[]} currentTerrain
 * @property {TerrainProviderCallback} callback
 */

/** @type {Map<string, TerrainProviderMeta>} */
const terrainProviders = new Map();

/** @type {Signal<{ providerId: string; shapes: TerrainShape[]; }[]>} */
export const currentTerrainByProvider$ = new Signal([]);

/** @type {Signal<TerrainShape[]>} */
export const allCurrentTerrain$ = new Signal([]);

/**
 * Returns an array of all shapes for the listed provider IDs.
 * If no IDs are provided, returns all shapes for all providers.
 * @param {string[] | undefined} terrainProviderIds
*/
export function getShapesByTerrainProviderIds(terrainProviderIds) {
	return terrainProviderIds?.length
		? currentTerrainByProvider$.value.filter(x => terrainProviderIds.includes(x.providerId)).flatMap(x => x.shapes)
		: allCurrentTerrain$.value;
}

/**
 * Updates the currentTerrain$ signal with the current terrain data from the providers.
 * Throttled so that rapid updates don't cause rapid re-renders.
 * @type {() => void}
 */
const updateCurrentTerrain = foundry.utils.throttle(() => {
	currentTerrainByProvider$.value = [...terrainProviders.values()]
		.map(p => ({ providerId: p.id, shapes: [...p.currentTerrain] }));
	allCurrentTerrain$.value = currentTerrainByProvider$.value.flatMap(x => x.shapes);
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
