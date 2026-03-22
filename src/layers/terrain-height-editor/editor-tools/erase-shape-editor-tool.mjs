/** @import { TerrainShape } from "../../../geometry/terrain-shape.mjs"; */
import { heightMap } from "../../../geometry/height-map.mjs";
import { AbstractShapePickerEditorTool } from "./abstract/abstract-shape-picker-editor-tool.mjs";

/**
 * Tool that allows a user to erase an existing shape.
 */
export class EraseShapeEditorTool extends AbstractShapePickerEditorTool {

	static hint = "TERRAINHEIGHTTOOLS.SelectAShapeEraseHint";

	static submitLabel = "TERRAINHEIGHTTOOLS.EraseSelectedShape";

	static submitIcon = "fas fa-eraser";

	/**
	 * @param {TerrainShape} shape
	 * @override
	 */
	_selectShape(shape) {
		heightMap.eraseShape(shape);
	}
}
