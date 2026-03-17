import { TerrainPaintPalette } from "../../../applications/terrain-paint-palette.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { paintingConfig$ } from "../../../stores/drawing.mjs";
import { getTerrainType, terrainTypeMap$ } from "../../../stores/terrain-types.mjs";
import { AbstractPolygonEditorTool } from "./abstract/abstract-polygon-editor-tool.mjs";

/**
 * Tool for allowing the user to paint an arbitrary polygon on the canvas.
 */
export class PaintPolygonEditorTool extends AbstractPolygonEditorTool {

	static APPLICATION_TYPE = TerrainPaintPalette;

	/** @override */
	_canDraw() {
		const terrainTypeId = paintingConfig$.terrainTypeId.value;
		return terrainTypeId && terrainTypeMap$.value.has(terrainTypeId);
	}

	/** @override */
	_configurePreviewLine(g) {
		const terrainTypeId = paintingConfig$.terrainTypeId.value;
		const terrainType = getTerrainType(terrainTypeId);

		g.lineStyle(terrainType.lineWidth, Color.from(terrainType.lineColor ?? "#000000"), terrainType.lineOpacity);
	}

	/** @override */
	_configurePreviewFill(g) {
		const terrainTypeId = paintingConfig$.terrainTypeId.value;
		const terrainType = getTerrainType(terrainTypeId);

		if (terrainType.fillType !== CONST.DRAWING_FILL_TYPES.NONE)
			g.beginFill(Color.from(terrainType.fillColor ?? "#000000"), terrainType.fillOpacity);
	}

	/**
	 * @param {{ X: number; Y: number; }[][]} polygons
	 * @override
	 */
	_use(polygons) {
		const { terrainTypeId, height, elevation, mode } = paintingConfig$.value;
		const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;

		for (const polygon of polygons) {
			heightMap.paintRegion({ polygon }, terrainTypeId, usesHeight ? height : 0, usesHeight ? elevation : 0, { mode });
		}
	}
}
