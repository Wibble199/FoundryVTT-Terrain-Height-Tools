import { getTerrainColor, getTerrainType } from "../stores/terrain-types.mjs";
import { getGridCellPolygon } from "../utils/grid-utils.mjs";

export class GridHighlightGraphics extends GridHighlight {

	/** Colour to highlight new cells with. */
	color = 0xFFFFFF;

	/** @override */
	highlight(x, y) {
		const shouldDraw = super.highlight(x, y);
		if (shouldDraw) this._drawGridCell(x, y);
		return shouldDraw;
	}

	_drawGridCell(row, col) {
		this.beginFill(this.color, 0.4)
			.drawPolygon(getGridCellPolygon(row, col))
			.endFill();
	}

	/**
	 * Sets the highlight colour based on the given terrain type ID.
	 * @param {string} terrainTypeId
	 */
	_setColorFromTerrainTypeId(terrainTypeId) {
		const terrainType = getTerrainType(terrainTypeId);
		if (terrainType)
			this.color = getTerrainColor(terrainType);
	}
}
