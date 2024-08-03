import { SignalSet } from "../utils/reactive.mjs";

/** @type {SignalSet<import("../types").HeightMapShape[]>} */
export const terrainProviders$ = new SignalSet();

const terrainData$ = terrainProviders$.map(shapes => shapes.flat(1));

/** @type {import("../types").HeightMapShape[]} */
let currentTerrainData = [];
terrainData$.subscribe(v => currentTerrainData = v);

export const terrainData = {
	/** Observable of all terrain data from all providers. */
	$: terrainData$,

	/** Gets the current terrain data from all providers at this moment in time. */
	get current() { return currentTerrainData; }
};
