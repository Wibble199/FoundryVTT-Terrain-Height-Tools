/** @import { PointLike } from "../../../../geometry/point.mjs" */
import { TerrainErasePalette } from "../../../applications/terrain-erase-palette.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { drawingMode$, eraseConfig$ } from "../../../stores/drawing.mjs";
import { abortableSubscribe } from "../../../utils/signal-utils.mjs";
import { AbstractPolygonEditorTool } from "./abstract/abstract-polygon-editor-tool.mjs";

/**
 * Tool for allowing the user to erase a region from the canvas.
 */
export class EraseEditorTool extends AbstractPolygonEditorTool {

	static APPLICATION_TYPE = TerrainErasePalette;

	constructor() {
		super();

		// If selected drawing mode is cells and the scene is gridless, select another
		if (canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS && drawingMode$.value === "gridCells")
			drawingMode$.value = "rectangle";

		// Update drawing mode when changed in UI
		abortableSubscribe(drawingMode$, drawingMode => this._selectDrawingMode(drawingMode), this._cleanupSignal);
	}

	/** @override */
	_configurePreviewLine(g) {
		g.lineStyle(4, 0x000000, 0.6);
	}

	/** @override */
	_configurePreviewFill(g) {
		g.beginFill(0x000000, 0.2);
	}

	/**
	 * @param {{ polygon: PointLike[]; holes?: PointLike[][] }[]} polygons
	 * @override
	 */
	_use(polygons) {
		const { excludedTerrainTypeIds: excludingTerrainTypeIds, bottom, top } = eraseConfig$.value;
		heightMap.eraseRegions(polygons, { excludingTerrainTypeIds, bottom, top });
	}
}
