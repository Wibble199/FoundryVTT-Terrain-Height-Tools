import { TerrainPaintPalette } from "../../../applications/terrain-paint-palette.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { paintingConfig$ } from "../../../stores/drawing.mjs";
import { getTerrainType } from "../../../stores/terrain-types.mjs";
import { AbstractEditorTool } from "./abstract/abstract-editor-tool.mjs";

export class FillEditorTool extends AbstractEditorTool {

	static APPLICATION_TYPE = TerrainPaintPalette;

	/** @override */
	_onMouseDownLeft(x, y) {
		const { terrainTypeId, height, elevation, mode, floodMode } = paintingConfig$.value;
		const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;

		heightMap.fillRegion(
			[x, y],
			terrainTypeId,
			usesHeight ? height : 0,
			usesHeight ? elevation : 0,
			{ floodMode, paintMode: mode }
		);
	}
}
