import { TerrainPaintPalette } from "../../../applications/terrain-paint-palette.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { eraseConfig$ } from "../../../stores/drawing.mjs";
import { AbstractPolygonEditorTool } from "./abstract/abstract-polygon-editor-tool.mjs";

/**
 * Tool for allowing the user to erase an arbitrary polygon from the canvas.
 */
export class ErasePolygonEditorTool extends AbstractPolygonEditorTool {

	static APPLICATION_TYPE = TerrainPaintPalette;

	/** @override */
	_configurePreviewLine(g) {
		g.lineStyle(4, 0x000000, 0.6);
	}

	/** @override */
	_configurePreviewFill(g) {
		g.beginFill(0x000000, 0.2);
	}

	/**
	 * @param {{ X: number; Y: number; }[][]} polygons
	 * @override
	 */
	_use(polygons) {
		const { excludedTerrainTypeIds: excludingTerrainTypeIds, bottom, top } = eraseConfig$.value;

		for (const polygon of polygons) {
			heightMap.eraseRegion({ polygon }, { excludingTerrainTypeIds, bottom, top });
		}
	}
}
