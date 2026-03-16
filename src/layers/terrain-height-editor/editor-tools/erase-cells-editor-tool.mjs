import { heightMap } from "../../../geometry/height-map.mjs";
import { eraseConfig$ } from "../../../stores/drawing.mjs";
import { AbstractCellEditorTool } from "./abstract/abstract-cell-editor-tool.mjs";

/**
 * Tool that allows the user to earse grid cells.
 */
export class EraseCellsEditorTool extends AbstractCellEditorTool {

	/** @override */
	_configureHighlight(g) {
		g.beginFill(0x000000, 0.4);
	}

	/**
	 * @param {[number, number][]} selectedCells
	 * @override
	 */
	_use(selectedCells) {
		const { excludedTerrainTypeIds: excludingTerrainTypeIds, bottom, top } = eraseConfig$.value;
		heightMap.eraseCells(selectedCells, { excludingTerrainTypeIds, bottom, top });
	}
}
