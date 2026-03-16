/** @import { TerrainShape } from "../../../geometry/terrain-shape.mjs"; */
import { heightMap } from "../../../geometry/height-map.mjs";
import { AbstractShapeEditorTool } from "./abstract/abstract-shape-editor-tool.mjs";

/**
 * Tool that allows a user to erase an existing shape.
 */
export class EraseShapeEditorTool extends AbstractShapeEditorTool {

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
