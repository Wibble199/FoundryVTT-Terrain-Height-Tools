/** @import { HeightMapShape } from "./height-map-shape.mjs"; */
/** @import { LineOfSightIntersectionRegion } from "./height-map-shape.mjs" */
import { distinctBy } from "../utils/array-utils.mjs";
import { getTerrainTypeMap, getTerrainTypes } from "../utils/terrain-types.mjs";

/**
 * @typedef {Object} FlattenedLineOfSightIntersectionRegion
 * @property {{ x: number; y: number; h: number; t: number; }} start The start position of the intersection region.
 * @property {{ x: number; y: number; h: number; t: number; }} end The end position of the intersection region.
 * @property {HeightMapShape[]} shapes The shapes that make up this intersection region.
 * @property {boolean} skimmed
 */

/**
 * Calculates the line of sight between the two given pixel coordinate points and heights.
 * Returns an array of all shapes that were intersected, along with the regions where those shapes were intersected.
 * @param {HeightMapShape[]} shapes Shapes to perform LoS calculations against.
 * @param {{ x: number; y: number; h: number; }} p1 The first point, where `x` and `y` are pixel coordinates.
 * @param {{ x: number; y: number; h: number; }} p2 The second point, where `x` and `y` are pixel coordinates.
 * @param {Object} [options={}] Options that change how the calculation is done.
 * @param {boolean} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a
 * height value will be included in the return list. They are treated as having infinite height.
 * @returns {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]}
 */
export function calculateLineOfSight(shapes, p1, p2, { includeNoHeightTerrain = false } = {}) {
	const terrainTypes = getTerrainTypeMap();

	/** @type {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]} */
	const intersectionsByShape = [];

	for (const shape of shapes) {
		// Ignore shapes of deleted terrain types
		if (!terrainTypes.has(shape.terrainTypeId)) continue;

		const { usesHeight } = terrainTypes.get(shape.terrainTypeId);

		// If this shape has a no-height terrain, only test for intersections if we are includeNoHeightTerrain
		if (!usesHeight && !includeNoHeightTerrain) continue;

		const regions = shape.getIntersections(p1, p2, usesHeight);
		if (regions.length > 0)
			intersectionsByShape.push({ shape, regions });
	}

	return intersectionsByShape;
}

/**
 * Flattens an array of line of sight intersection regions into a single collection of regions.
 * @param {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]} shapeRegions
 * @returns {FlattenedLineOfSightIntersectionRegion[]}
 */
export function flattenLineOfSightIntersectionRegions(shapeRegions) {
	/** @type {FlattenedLineOfSightIntersectionRegion[]} */
	const flatIntersections = [];

	// Find all points where a change happens - this may be entering, leaving or touching a shape.
	const boundaries = distinctBy(
			shapeRegions.flatMap(s => s.regions.flatMap(r => [r.start, r.end])),
			r => r.t
		).sort((a, b) => a.t - b.t);

	/** @type {{ x: number; y: number; h: number; t: number; }} */
	let lastPosition = undefined; // first boundary should always have 0 'active regions'

	// Array of terrainTypeIds ordered by their order defined in the settings. We use this to determine which should
	// be shown in the case of multiple overlapping shapes.
	const terrainTypeIdPriority = getTerrainTypes().map(t => t.id);

	for (const boundary of boundaries) {
		// Collect a list of intersection regions 'active' at this boundary.
		// An 'active' intersection is one that has been happening up until this particular point. Consider a map
		// as follows, where 1 and 2 are different shapes:
		// 1--22
		// 2222-
		// If a ray was drawn from (0,1) -> (3,1), the boundaries would be at x=0, x=1, x=3, x=4, x=5.
		// At boundary x=0, no regions would be 'active' as up until this point no intersections where happening.
		// At boundary x=1, two regions would be 'active', one from shape 1 and one from shape 2.
		// At boundary x=3, one region would be 'active', the skimming region against shape 2.
		// At boundary x=4, one region would be 'active', the shape entry into shape 2.
		// At boundary x=5, one region would be 'active', another skimming region against shape 2.
		const { t } = boundary;
		const activeRegions = shapeRegions
			.map(({ shape, regions }) => ({ shape, region: regions.find(r => r.start.t < t && r.end.t >= t) }))
			.filter(({ region }) => !!region);

		// If there is no active region, don't add an element to the intersections array, just move the position on.
		if (activeRegions.length > 0) {
			// Prioritise the shapes based on the index the terrain is defined in the settings.
			// I.E. terrain types that appear higher in the list in the palette have priority here.
			const prioritisedShapes = activeRegions
				.sort((a, b) => terrainTypeIdPriority.indexOf(a.shape.terrainTypeId) - terrainTypeIdPriority.indexOf(b.shape.terrainTypeId))
				.map(s => s.shape);

			// To determine if the resulting flattened region has skimmed there are a few cases to account for.
			// - If any of the constituent regions are not skimmed, then the flat region is a non-skim
			// - If all of the constituent regions are skims, AND if there is a skim on either side of the test ray,
			//   then the flat region is effectively not a skim as it goes through terrain.
			// - Only if all the constituent regions are skims and all are on the same side of the test ray does
			//   the flat region as a whole become a skim.
			const skimmed = activeRegions.every(r => r.region.skimmed)
				&& !(activeRegions.some(r => r.region.skimSide === 1) && activeRegions.some(r => r.region.skimSide === -1));

			flatIntersections.push({
				start: lastPosition,
				end: boundary,
				shapes: prioritisedShapes,
				skimmed
			});
		}

		lastPosition = boundary;
	}

	return flatIntersections;
}
