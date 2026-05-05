/** @import { Signal } from "@preact/signals-core" */
import { signal } from "@preact/signals-core";

/** @type {Signal<string>} */
export const activeControl$ = signal();

/** @type {Signal<string>} */
export const activeTool$ = signal();

/**
 * Updates the `activeControl$` and `activeTool$` signal values from the given `SceneControls` instance.
 * @param {SceneControls} controls
 */
export function updateActiveControlTool(controls) {
	activeControl$.value = controls.control.name;
	activeTool$.value = controls.tool.name;
}
