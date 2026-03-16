/** @import { Signal } from "@preact/signals-core" */
import { batch, signal } from "@preact/signals-core";
import { flags, moduleName } from "../consts.mjs";

export const canvasReady$ = signal(false);

/** Position of the cursor in world coordinate space. */
export const cursorWorldPosition$ = signal({ x: 0, y: 0 });

/** @type {Signal<Set<string>>} */
export const invisibleTerrainTypes$ = signal(new Set());

/** @type {Signal<boolean | null>} */
export const sceneRenderAboveTilesChoice$ = signal(null);

/** Whether the THT height map editor layer is currently active. */
export const isEditLayerActive$ = signal(false);

export function onUpdateScene(scene) {
	// A scene other than the one the current user is on was updated
	if (scene.id !== canvas.scene.id) return;
	onCanvasReady({ scene });
}

export function onCanvasReady({ scene }) {
	batch(() => {
		invisibleTerrainTypes$.value = new Set(scene.getFlag(moduleName, flags.invisibleTerrainTypes) ?? []);
		sceneRenderAboveTilesChoice$.value = scene.getFlag(moduleName, flags.terrainLayerAboveTiles) ?? null;
		canvasReady$.value = true;
	});
}

export function onCanvasTearDown() {
	batch(() => {
		canvasReady$.value = false;
		invisibleTerrainTypes$.value = new Set();
		sceneRenderAboveTilesChoice$.value = null;
	});
}
