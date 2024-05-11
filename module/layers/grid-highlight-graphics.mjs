import { getTerrainType } from '../utils/terrain-types.mjs';

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
			.drawPolygon(this._getGridCellPoly(row, col))
			.endFill()
	}

	_getGridCellPoly(row, col) {
		// Gridless is not supported
		if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

		const [x, y] = game.canvas.grid.grid.getPixelsFromGridPosition(row, col);

		// For hex grids, can use the getPolygon function to generate them for us
		if (game.canvas.grid.isHex) {
			const pointsFlat = game.canvas.grid.grid.getPolygon(x, y)
			const polygon = [];
			for (let i = 0; i < pointsFlat.length; i += 2) {
				polygon.push({ x: pointsFlat[i], y: pointsFlat[i + 1] });
			}
			return polygon;
		}

		// Can get the points for a square grid easily
		const { w, h } = game.canvas.grid;
		return [
			{ x, y },
			{ x: x + w, y },
			{ x: x + w, y: y + h },
			{ x, y: y + h },
		];
	}

	/**
	 * Sets the highlight colour based on the given terrain type ID.
	 * @param {string} terrainTypeId
	 */
	_setColorFromTerrainTypeId(terrainTypeId) {
		const terrainType = getTerrainType(terrainTypeId);
		if (!terrainType) return;

		// If the terrain type has a fill colour, use that
		if (terrainType.fillOpacity > 0) {
			this.color = Color.from(terrainType.fillColor);
			return;
		}

		// If the terrain type does not have a fill colour but has a border colour, use that
		if (terrainType.lineWidth > 0 && terrainType.lineOpacity > 0) {
			this.color = Color.from(terrainType.lineColor);
			return;
		}

		// Otherwise use a default
		this.color = 0x00FFFF;
	}
}
