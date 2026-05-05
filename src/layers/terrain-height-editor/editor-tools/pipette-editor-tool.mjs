/** @import { TerrainShape } from "../../../geometry/terrain-shape.mjs"; */
import { tools } from "../../../consts.mjs";
import { paintingConfig$ } from "../../../stores/drawing.mjs";
import { AbstractShapePickerEditorTool } from "./abstract/abstract-shape-picker-editor-tool.mjs";

/**
 * Tool that allows the user to copy the paint config from an existing shape.
 */
export class PipetteEditorTool extends AbstractShapePickerEditorTool {

	static hint = "TERRAINHEIGHTTOOLS.SelectAShapeCopyHint";

	static submitLabel = "TERRAINHEIGHTTOOLS.CopySelectedShapeConfiguration";

	static submitIcon = "fas fa-eye-dropper";

	/**
	 * @param {TerrainShape} shape
	 * @override
	 */
	_selectShape(shape) {
		paintingConfig$.value = {
			terrainTypeId: shape.terrainTypeId,
			height: Math.max(shape.height, 1),
			elevation: Math.max(shape.elevation, 0)
		};

		ui.controls.activate({ tool: tools.paint });
	}
}
