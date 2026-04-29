/** @import { TerrainShape } from "../../../geometry/terrain-shape.mjs"; */
import { terrainHeightEditorControlName, tools } from "../../../consts.mjs";
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

		// Select the paintbrush tool. This feels like a horrible dirty way of doing this, but there doesn't seem to be
		// any API exposed by Foundry to set the tool without pretending to click the button.
		document.querySelector(`#tools-panel-${terrainHeightEditorControlName} [data-tool="${tools.paint}"]`)?.click();
	}
}
