import { computed } from "@preact/signals-core";
import { TerrainPaintPalette } from "../../../applications/terrain-paint-palette.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { drawingMode$, paintingConfig$ } from "../../../stores/drawing.mjs";
import { getTerrainType, terrainTypeMap$ } from "../../../stores/terrain-types.mjs";
import { abortableSubscribe } from "../../../utils/signal-utils.mjs";
import { AbstractPolygonEditorTool } from "./abstract/abstract-polygon-editor-tool.mjs";

/**
 * Tool for allowing the user to paint a region on the canvas.
 */
export class PaintEditorTool extends AbstractPolygonEditorTool {

	static APPLICATION_TYPE = TerrainPaintPalette;

	constructor() {
		super();

		// If selected drawing mode is cells and the scene is gridless, select another
		if (canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS && drawingMode$.value === "gridCells")
			drawingMode$.value = "rectangle";

		// Update drawing mode when changed in UI
		abortableSubscribe(drawingMode$, drawingMode => this._selectDrawingMode(drawingMode), this._cleanupSignal);
	}

	/** @override */
	_canDraw = computed(() => {
		const terrainTypeId = paintingConfig$.terrainTypeId.value;
		return !!terrainTypeId && terrainTypeMap$.value.has(terrainTypeId);
	});

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
	 * @param {{ polygon: PointLike[]; holes?: PointLike[][] }[]} polygons
	 * @override
	 */
	_use(polygons) {
		const { terrainTypeId, height, elevation, mode } = paintingConfig$.value;
		const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;

		heightMap.paintRegions(
			polygons,
			terrainTypeId,
			usesHeight ? height : 0,
			usesHeight ? elevation : 0,
			{ mode }
		);
	}
}
