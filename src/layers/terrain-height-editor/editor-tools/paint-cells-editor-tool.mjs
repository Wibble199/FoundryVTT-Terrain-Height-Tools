import { heightMap } from "../../../geometry/height-map.mjs";
import { paintingConfig$ } from "../../../stores/drawing.mjs";
import { getTerrainColor, getTerrainType } from "../../../stores/terrain-types.mjs";
import { AbstractCellEditorTool } from "./abstract/abstract-cell-editor-tool.mjs";

/**
 * Tool that allows the user to paint regions of cells with the configured terrain type/height/elevation.
 */
export class PaintCellsEditorTool extends AbstractCellEditorTool {

	/** @override */
	_configureHighlight(g) {
		const terrainTypeId = paintingConfig$.terrainTypeId.value;
		const terrainType = getTerrainType(terrainTypeId);
		g.beginFill(getTerrainColor(terrainType, 0x000000), 0.4);
	}

	/**
	 * @param {[number, number][]} selectedCells
	 * @override
	 */
	_use(selectedCells) {
		const { terrainTypeId, height, elevation, mode } = paintingConfig$.value;
		const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;
		heightMap.paintCells(selectedCells, terrainTypeId, usesHeight ? height : 0, usesHeight ? elevation : 0, { mode });
	}
}
