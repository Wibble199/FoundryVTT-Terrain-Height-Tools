/** @import { TerrainShape } from "../../../geometry/terrain-shape.mjs" */
import { TerrainShapeChoiceDialog } from "../../../../applications/terrain-shape-choice-dialog.mjs";
import { heightMap } from "../../../../geometry/height-map.mjs";
import { AbstractEditorTool } from "./abstract-editor-tool.mjs";

/**
 * Base class for tools that require the user select a single existing shape from the canvas.
 */
export class AbstractShapeEditorTool extends AbstractEditorTool {

	static hint = "Select a shape";

	static submitLabel = "Select";

	static submitIcon = "fas fa-eye-dropper";

	_onMouseDownLeft(x, y) {
		const shapes = heightMap.getShapesAtPoint(x, y);
		switch (shapes.length) {
			case 0: return;
			case 1: return this._selectShape(shapes[0]);
			default: return TerrainShapeChoiceDialog.show(shapes, {
				hint: this.constructor.hint,
				submitLabel: this.constructor.submitLabel,
				submitIcon: this.constructor.submitIcon
			}).then(shape => this._selectShape(shape));
		}
	}

	/**
	 * Called when the user has selected a shape.
	 * @param {TerrainShape} shape
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	_selectShape(shape) {
	}
}
