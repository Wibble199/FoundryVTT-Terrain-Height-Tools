/** @import { TerrainShape } from "../../../geometry/terrain-shape.mjs"; */
import { ShapeConversionConfig } from "../../../applications/shape-conversion-config.mjs";
import { wallHeightModuleName } from "../../../consts.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { convertConfig$ } from "../../../stores/drawing.mjs";
import { getTerrainType } from "../../../stores/terrain-types.mjs";
import { toSceneUnits } from "../../../utils/grid-utils.mjs";
import { getLabelText } from "../../terrain-height-graphics/terrain-shape-graphic.mjs";
import { AbstractShapeEditorTool } from "./abstract/abstract-shape-editor-tool.mjs";

/**
 * Tool that allows a user to convert an existing shape into drawing/walls/region.
 */
export class ConvertShapeEditorTool extends AbstractShapeEditorTool {

	static APPLICATION_TYPE = ShapeConversionConfig;

	static hint = "TERRAINHEIGHTTOOLS.SelectAShapeConvertHint";

	static submitLabel = "TERRAINHEIGHTTOOLS.ConvertSelectedShape";

	static submitIcon = "fas fa-arrow-turn-right";

	/**
	 * @param {TerrainShape} shape
	 * @override
	 */
	async _selectShape(shape) {
		const { toDrawing, toRegion, toWalls, wallConfig, setWallHeightFlags, deleteAfter } = convertConfig$.value;

		const terrainData = getTerrainType(shape.terrainTypeId);
		if (!terrainData) return;

		if (toDrawing) {
			const { x1, y1, w, h } = shape.polygon.boundingBox;
			await canvas.scene.createEmbeddedDocuments("Drawing", [
				{
					x: x1,
					y: y1,
					shape: {
						type: "p",
						width: w,
						height: h,
						points: [
							...shape.polygon.vertices.flatMap(v => [v.x - x1, v.y - y1]),
							shape.polygon.vertices[0].x - x1,
							shape.polygon.vertices[0].y - y1
						]
					},
					fillAlpha: terrainData.fillOpacity,
					fillColor: terrainData.fillColor,
					fillType: terrainData.fillType,
					texture: terrainData.fillTexture,
					strokeAlpha: terrainData.lineOpacity,
					strokeColor: terrainData.lineColor,
					strokeWidth: terrainData.lineWidth,
					text: getLabelText(shape, terrainData),
					textAlpha: terrainData.textOpacity,
					textColor: terrainData.textColor,
					fontFamily: terrainData.font,
					fontSize: terrainData.textSize
				},
				...shape.holes.map(hole => {
					const { x1, y1, w, h } = hole.boundingBox;
					return {
						x: x1,
						y: y1,
						shape: {
							type: "p",
							width: w,
							height: h,
							points: [
								...hole.vertices.flatMap(v => [v.x - x1, v.y - y1]),
								hole.vertices[0].x - x1,
								hole.vertices[0].y - y1
							]
						},
						fillType: CONST.DRAWING_FILL_TYPES.NONE,
						texture: terrainData.fillTexture,
						strokeAlpha: terrainData.lineOpacity,
						strokeColor: terrainData.lineColor,
						strokeWidth: terrainData.lineWidth
					};
				})
			].filter(Boolean));
		}

		if (toRegion) {
			await canvas.scene.createEmbeddedDocuments("Region", [
				{
					name: terrainData.name,
					color: Color.from(terrainData.fillColor),
					elevation: terrainData.usesHeight
						? { top: shape.top, bottom: shape.bottom }
						: { top: null, bottom: null },
					shapes: [
						{
							type: "polygon",
							hole: false,
							points: shape.polygon.vertices.flatMap(v => [v.x, v.y])
						},
						...shape.holes.map(hole => ({
							type: "polygon",
							hole: true,
							points: hole.vertices.flatMap(v => [v.x, v.y])
						}))
					],
					visibility: CONST.REGION_VISIBILITY.ALWAYS
				}
			]);
		}

		if (toWalls) {
			const flags = setWallHeightFlags && game.modules.get(wallHeightModuleName)?.active
				? { "wall-height": { top: toSceneUnits(shape.top), bottom: toSceneUnits(shape.bottom) } }
				: {};

			await canvas.scene.createEmbeddedDocuments("Wall", [...shape.polygon.edges, ...shape.holes.flatMap(h => h.edges)]
				.map(edge => ({
					...wallConfig,
					c: [
						edge.p1.x,
						edge.p1.y,
						edge.p2.x,
						edge.p2.y
					],
					flags
				})));
		}

		if (deleteAfter)
			await heightMap.eraseShape(shape);

		// Notify user, because it may not be obvious that it's worked.
		ui.notifications.info(game.i18n.localize("TERRAINHEIGHTTOOLS.NotifyShapeConversionComplete"));
	}
}
