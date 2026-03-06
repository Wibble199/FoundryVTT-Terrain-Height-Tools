/** @import { Signal } from "@preact/signals-core" */
import { signal } from "@preact/signals-core";
import { flags, moduleName } from "../consts.mjs";

/** Position of the cursor in world coordinate space. */
export const cursorWorldPosition$ = signal({ x: 0, y: 0 });

/** @type {Signal<Set<string>>} */
export const invisibleTerrainTypes$ = signal([]);

/** @type {Signal<boolean | null>} */
export const sceneRenderAboveTilesChoice$ = signal(null);

export function onUpdateScene(scene) {
	if (!scene.active) return; // TODO: this should be the scene the user is on, not the active scene
	onLoadScene(scene);
}

export function onLoadScene(scene) {
	invisibleTerrainTypes$.value = new Set(scene.getFlag(moduleName, flags.invisibleTerrainTypes) ?? []);
	sceneRenderAboveTilesChoice$.value = scene.getFlag(moduleName, flags.terrainLayerAboveTiles) ?? null;
}
