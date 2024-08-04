import { distinctBy, groupBy } from "../utils/array-utils.mjs";
import { error } from "../utils/log.mjs";
import { roundTo } from "../utils/misc-utils.mjs";
import { getTerrainTypeMap } from "../utils/terrain-types.mjs";
import { LineSegment } from "./line-segment.mjs";

/**
 * @typedef {Object} LineOfSightIntersection
 * @property {number} x
 * @property {number} y
 * @property {number} t
 * @property {number} u
 * @property {LineSegment | undefined} edge
 * @property {import("./polygon.mjs").Polygon | undefined} hole
 */

export class LineOfSight {

	/**
	 * Calculates the line of sight between the two given pixel coordinate points and heights.
	 * Returns an array of all shapes that were intersected, along with the regions where those shapes were intersected.
	 * @param {import("../types").HeightMapShape[]} shapes The shapes to perform LoS calculation against.
	 * @param {import("../types").Point3D} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {import("../types").Point3D} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {Object} [options={}] Options that change how the calculation is done.
	 * @param {boolean} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a
	 * height value will be included in the return list. They are treated as having infinite height.
	 * @returns {{ shape: import("../types").HeightMapShape; regions: import("../types").LineOfSightIntersectionRegion[] }[]}
	 */
	static calculate(shapes, p1, p2, { includeNoHeightTerrain = false } = {}) {
		const terrainTypes = getTerrainTypeMap();

		/** @type {{ shape: import("../types").HeightMapShape; regions: import("../types").LineOfSightIntersectionRegion[] }[]} */
		const intersectionsByShape = [];

		for (const shape of shapes) {
			// Ignore shapes of deleted terrain types
			if (!terrainTypes.has(shape.terrainTypeId)) continue;

			const { usesHeight } = terrainTypes.get(shape.terrainTypeId);

			// If this shape has a no-height terrain, only test for intersections if we are includeNoHeightTerrain
			if (!usesHeight && !includeNoHeightTerrain) continue;

			const regions = LineOfSight.getIntersectionsOfShape(shape, p1, p2, usesHeight);
			if (regions.length > 0)
				intersectionsByShape.push({ shape, regions });
		}

		return intersectionsByShape;
	}

	/**
	 * Determines intersections of a ray from p1 to p2 for the given shape.
	 * @param {import("../types").HeightMapShape} shape
	 * @param {import("../types").Point3D} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {import("../types").Point3D} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {boolean} usesHeight Whether or not the terrain type assigned to the shape utilises height or not.
	 * skim regions.
	 */
	static getIntersectionsOfShape(shape, { x: x1, y: y1, h: h1 }, { x: x2, y: y2, h: h2 }, usesHeight) {
		// If the shape is shorter than both the start and end heights, then we can skip the intersection tests as
		// the line of sight ray would never cross at the required height for an intersection.
		// E.G. a ray from height 2 to height 3 would never intersect a terrain of height 1.
		const shapeTop = usesHeight ? shape.elevation + shape.height : Infinity;
		const shapeBottom = usesHeight ? shape.elevation : -Infinity;
		if (usesHeight && h1 > shapeTop && h2 > shapeTop) return [];
		if (usesHeight && h1 < shapeBottom && h2 < shapeBottom) return [];

		const lerpLosHeight = (/** @type {number} */ t) => (h2 - h1) * t + h1;
		const inverseLerpLosHeight = (/** @type {number} */ h) => (h - h1) / (h2 - h1);

		// If the test ray extends above the height of the shape, instead stop it at that height
		let t1 = 0;
		if (usesHeight && h1 > shapeTop) {
			({ x: x1, y: y1 } = LineSegment.lerp(x1, y1, x2, y2, t1 = inverseLerpLosHeight(shapeTop)));
			h1 = shapeTop;
		} else if (usesHeight && h1 < shapeBottom) {
			({ x: x1, y: y1 } = LineSegment.lerp(x1, y1, x2, y2, t1 = inverseLerpLosHeight(shapeBottom)));
			h1 = shapeBottom;
		}

		let t2 = 1;
		if (usesHeight && h2 > shapeTop) {
			({ x: x2, y: y2 } = LineSegment.lerp(x1, y1, x2, y2, t2 = inverseLerpLosHeight(shapeTop)));
			h2 = shapeTop;
		} else if (usesHeight && h2 < shapeBottom) {
			({ x: x2, y: y2 } = LineSegment.lerp(x1, y1, x2, y2, t2 = inverseLerpLosHeight(shapeBottom)));
			h2 = shapeBottom;
		}

		const testRay = LineSegment.fromCoords(x1, y1, x2, y2);
		const inverseTestRay = testRay.inverse();

		// Loop each edge in this shape and check for an intersection. Record height, shape and how far along the
		// test line the intersection occured.
		const allEdges = shape.polygon.edges
			.map(e => /** @type {[import("./polygon.mjs").Polygon | undefined, LineSegment]} */ ([undefined, e]))
			.concat((shape.holes ?? [])
				.flatMap(h => h.edges.map(e => /** @type {[import("./polygon.mjs").Polygon, LineSegment]} */ ([h, e]))));

		/** @type {LineOfSightIntersection} */
		const intersections = [];
		for (const [hole, edge] of allEdges) {
			const intersection = testRay.intersectsAt(edge);

			// Do not include intersections at t=0 as it can interfere with initial isInside check
			if (!intersection || intersection.t < Number.EPSILON) continue;

			intersections.push({ ...intersection, edge, hole });

			// If the intersection occured at u=0 or u=1, and the previous or next edge respectively is parallel to the
			// testray, then add a synthetic intersection for that edge. This makes it easier later to do the region
			// calculations later on, as we don't then need to check for vertex collisions and handle them differently.
			// If the prev/next edge is not parallel then it should cause it's own intersection and get added normally.
			if (intersection.u < Number.EPSILON) {
				const previousEdge = (hole ?? shape.polygon).previousEdge(edge);
				if (previousEdge.isParallelTo(testRay)) {
					intersections.push({ ...intersection, u: 1, edge: previousEdge, hole });
				}

			} else if (intersection.u > 1 - Number.EPSILON) {
				const nextEdge = (hole ?? shape.polygon).nextEdge(edge);
				if (nextEdge.isParallelTo(testRay)) {
					intersections.push({ ...intersection, u: 0, edge: nextEdge, hole });
				}
			}
		}

		// Next to use these intersections to determine the regions where an intersection is occuring.
		/** @type {import("../types").LineOfSightIntersectionRegion[]} */
		const regions = [];

		// There may be multiple intersections at an equal point along the test ray (t) - for example when touching a vertex
		// of a shape - it'll intersect both edges of the vertex. These are a special case and need to be handled
		// differently, so group everything by t.
		/** @type {LineOfSightIntersection[][]} */
		const intersectionsByT = [...groupBy(intersections, i => roundTo(i.t, Number.EPSILON)).entries()]
			.sort(([a], [b]) => a - b) // sort by t
			.map(([, intersections]) => intersections);

		// Determine if the start point of the test ray is inside or outside the shape, taking height into account.
		// If the start point lies exactly on an edge then we need to figure out which way the ray is facing - into the
		// shape or out of the shape. If the point does not lie on an edge, then we can just use containsPoint.
		// This code is very similar in structure to the code in handleEdgeIntersection - TODO: can we re-use that?
		let isInside = false;
		if (!usesHeight || (h1 <= shapeTop && h1 >= shapeBottom)) {
			const p1LiesOnEdges = allEdges
				.map(([poly, edge]) => ({ edge, poly, ...edge.findClosestPointOnLineTo(x1, y1) }))
				.filter(x =>
					x.t > -Number.EPSILON && x.t < 1 + Number.EPSILON &&
					x.distanceSquared < Number.EPSILON * Number.EPSILON);

			switch (p1LiesOnEdges.length) {
				case 0:
					isInside = shape.polygon.containsPoint(x1, y1, { containsOnEdge: false })
						&& !shape.holes?.some(h => h.containsPoint(x1, y1, { containsOnEdge: true }));
					break;

				case 1:
					// (Rename t to u because elsewhere we use t as the relative distance along the ray and u as the
					// relative distance along an edge, which is what we have here)
					const { edge, poly, t: u } = p1LiesOnEdges[0];

					if (u < Number.EPSILON) {
						const previousEdge = (poly ?? shape.polygon).previousEdge(edge);
						isInside = previousEdge.angleBetween(testRay) < previousEdge.angleBetween(edge);

					} else if (u > 1 - Number.EPSILON) {
						const nextEdge = (poly ?? shape.polygon).nextEdge(edge);
						isInside = edge.angleBetween(testRay) < edge.angleBetween(nextEdge);

					} else {
						const a = edge.angleBetween(testRay);
						isInside = a > 0 && a < Math.PI; // Do not count 0 or PI as inside because that means it's parallel
					}
					break;

				case 2:
					isInside = testRay.isBetween(p1LiesOnEdges[0].edge, p1LiesOnEdges[1].edge);
					break;

				default:
					if (p1LiesOnEdges.length % 2 !== 0) {
						warn(`Error when performing line of sight calculation: the line of sight ray starts at ${p1LiesOnEdges.length} vertices of a single shape, but expected 0, 1, or an even number. This case is not supported and will likely give incorrect line of sight calculation results.`);
						break;
					}

					// With the default height map, a 4-way intersection would be possible (but rare) on a square grid.
					// However, with custom providers, there could be more than 4 at a single intersection.
					// What we need to do is pair off the edges, and test whether the ray is between ALL pairs of edges.
					isInside = [...groupBy(p1LiesOnEdges, x => x.poly).values()]
						.every(edgeIntersections => (edgeIntersections[0].poly ?? shape.polygon)
							.pairEdges(edgeIntersections.map(x => x.edge))
							.every(([e1, e2]) => testRay.isBetween(e1, e2)));

					break;
			}
		}

		// If the test ray is flat in the height direction and this shape's top/bottom = the test ray height, then
		// whenever we 'enter' the shape, we're actually going to be skimming the top or bottom.
		const isSkimmingTopBottom = usesHeight && h1 === h2 && (h1 === shapeTop || h1 === shapeBottom);

		let lastIntersectionPosition = { x: x1, y: y1, h: h1, t: 0 };

		/** @param {{ x: number; y: number; t: number; }} param0 */
		const pushRegion = ({ x, y, t }) => {
			if (t === lastIntersectionPosition.t) return;
			const position = { x, y, t, h: lerpLosHeight(t) };
			if (isInside) {
				regions.push({
					start: lastIntersectionPosition,
					end: position,
					skimmed: isSkimmingTopBottom
				});
			}
			lastIntersectionPosition = position;
		};

		for (const intersectionsOfT of intersectionsByT) {
			switch (intersectionsOfT.length) {
				// In the case of a single intersection, then we have crossed an edge cleanly.
				case 1:
					pushRegion(intersectionsOfT[0]);
					isInside = !isInside;
					break;

				// In the case of two intersections, we have hit a vertex. Technically this can be handled by the
				// default cause, however the code here is much simpler to understand (and probably faster).
				case 2: {
					// If intersection2 comes before intersection1 in the shape, then swap them
					let [intersection1, intersection2] = intersectionsOfT;
					if (intersection2.edge.p2.equals(intersection1.edge.p1))
						[intersection1, intersection2] = [intersection2, intersection1];

					// Work out of the ray is passing between the two edges
					// If NEITHER the ray nor the inverse ray pass between, or BOTH have then the ray has skimmed this vertex
					// (on the outside or the inside of the shape respectively), so don't add the region to the array.
					const rayInside = testRay.isBetween(intersection1.edge, intersection2.edge);
					const inverseRayInside = inverseTestRay.isBetween(intersection1.edge, intersection2.edge);

					if (rayInside !== inverseRayInside) {
						pushRegion(intersection1);
						isInside = rayInside;
					}
					break;
				}

				// In the case of another even number (which can happen due to custom providers, or rarely on square
				// grids with the default height map provider when we have hit a 4-way vertex).
				default: {
					if (intersectionsOfT.length % 2 !== 0) {
						error(`Error occured when performing line of sight calculation: the line of sight ray met a shape and caused ${intersectionsOfT.length} intersections at the same point but expected either 1, or an even number. This case is not supported and will likely give incorrect line of sight calculation results.`);
						break;
					}

					// Pair up the edges which will give the entry/exit pairs. Then, check if the test ray or the
					// inverse test ray is going between all of them.
					// Like with the 2 case,
					const intersectionsOfTByHole = [...groupBy(intersectionsOfT, x => x.hole).values()];

					const rayInside = intersectionsOfTByHole
						.every(intersectionsOfTOfHole => (intersectionsOfTOfHole[0].hole ?? shape.polygon)
							.pairEdges(intersectionsOfTOfHole.map(x => x.edge))
							.every(([e1, e2]) => testRay.isBetween(e1, e2)));

					const inverseRayInside = intersectionsOfTByHole
						.every(intersectionsOfTOfHole => (intersectionsOfTOfHole[0].hole ?? shape.polygon)
							.pairEdges(intersectionsOfTOfHole.map(x => x.edge))
							.every(([e1, e2]) => inverseTestRay.isBetween(e1, e2)));

					if (rayInside !== inverseRayInside) {
						pushRegion(intersectionsOfT[0]);
						isInside = rayInside;
					}

					break;
				}
			}
		}

		// In case the last intersection was not at the end, ensure we close the region
		pushRegion({ x: x2, y: y2, t: 1 });

		// As a final step, need to calculate if any of the regions are 'skimmed' regions.
		// Note: this is done as an independent step as it allows us to add some tolerance without making a mess of the
		// normal intersection calculations. For example, adding some tolerance around the ends of lines can cause extra
		// intersections to occur when they otherwise wouldn't. This often gets more noticable on longer lines too.

		// Only edges that are (approximately) parallel to the test ray could cause a skimming to occur
		const parallelThreshold = 0.05; // radians
		const parallelEdges = allEdges
			.map(([, e]) => e)
			.filter(e =>
				Math.abs(testRay.angle - e.angle) < parallelThreshold ||
				Math.abs(inverseTestRay.angle - e.angle) < parallelThreshold);

		// For each edge that is parallel, check how far the ends are from the testRay (assuming testRay had
		// infinite length). If both are within a small threshold, then add it as a skimming region.
		const skimDistThresholdSquared = 16; // pixels
		/** @type {{ t1: number; t2: number }[]} */
		const skimRegions = [];
		for (const edge of parallelEdges) {
			// Cap the t values to 0-1 (i.e. on the testRay), but don't alter the distances.
			let { t: t1, distanceSquared: d1, point: point1 } = testRay.findClosestPointOnLineTo(edge.p1.x, edge.p1.y);
			t1 = Math.max(Math.min(t1, 1), 0);
			let { t: t2, distanceSquared: d2, point: point2 } = testRay.findClosestPointOnLineTo(edge.p2.x, edge.p2.y);
			t2 = Math.max(Math.min(t2, 1), 0);

			// If the two ends of the edge wouldn't be skimming, continue to next edge
			if (d1 > skimDistThresholdSquared || d2 > skimDistThresholdSquared || Math.abs(t1 - t2) <= Number.EPSILON)
				continue;

			skimRegions.push(t1 < t2 ? { t1, t2 } : { t1: t2, t2: t1 });
		}

		skimRegions.sort((a, b) => a.t1 - b.t2);

		// Merge these regions with the overall intersection regions, combining any adjacent skim regions together
		// (combining may only happen on a square grid, would never occur on a hex grid)
		/** @type {number | undefined} */
		let skimStartT = undefined;
		for (let i = 0; i < skimRegions.length; i++) {

			// Merge adjacent skim regions. The combined skim region is from skimStartT -> skimRegions[i].t2.
			skimStartT ??= skimRegions[i].t1;
			if (i === skimRegions.length - 1 || Math.abs(skimRegions[i].t2 - skimRegions[i + 1].t1) > Number.EPSILON) {
				const skimEndT = skimRegions[i].t2;

				// We need to figure out which, if any, of the intersection regions to remove.
				// We also need to figure out if we're overlapping any of these intersection regions, and if so, we
				// want to remove it but also insert a new one up to that point. E.G. if a region was from t=0.2 to
				// t=0.4, and then a skim region was from t=0.3 to t=0.5, remove the existing intersection region
				// and add a new one from t=0.2 to t=0.3. Note that the start and end intersect regions may be the
				// same if the skim region does not fully overlap it.

				/** @type {import("../types").LineOfSightIntersectionRegion | undefined} */
				let overlappingStartRegion = undefined;
				/** @type {import("../types").LineOfSightIntersectionRegion | undefined} */
				let overlappingEndRegion = undefined;

				// We also keep track of the indices to splice
				let spliceRangeStart = 0;
				let spliceRangeEnd = regions.length;

				for (let j = 0; j < regions.length; j++) {
					const region = regions[j];

					if (region.start.t < skimStartT && region.end.t > skimStartT)
						overlappingStartRegion = region;

					if (region.start.t < skimEndT && region.end.t > skimEndT)
						overlappingEndRegion = region;

					if (region.end.t <= skimStartT)
						spliceRangeStart = j + 1;

					if (region.start.t >= skimEndT && spliceRangeEnd > j)
						spliceRangeEnd = j;
				}

				const skimStartObject = { t: skimStartT, h: lerpLosHeight(skimStartT), ...testRay.lerp(skimStartT) };
				const skimEndObject = { t: skimEndT, h: lerpLosHeight(skimEndT), ...testRay.lerp(skimEndT) };

				// Actually remove the overlapping regions and insert the new regions
				/** @type {import("../types").LineOfSightIntersectionRegion[]} */
				const newElements = [
					overlappingStartRegion
						? {
							start: overlappingStartRegion.start,
							end: skimStartObject,
							skimmed: overlappingStartRegion.skimmed
						}
						: undefined,
					{
						start: skimStartObject,
						end: skimEndObject,
						skimmed: true
					},
					overlappingEndRegion
						? {
							start: skimEndObject,
							end: overlappingEndRegion.end,
							skimmed: overlappingEndRegion.skimmed
						}
						: undefined
				].filter(Boolean);

				regions.splice(spliceRangeStart, spliceRangeEnd - spliceRangeStart, ...newElements);

				skimStartT = undefined;
			}
		}

		// Finally, in case we trimmed the testRay to make the logic simpler, we need to convert the trimmed-ray `t`
		// values back into full ray `t` values
		if (t1 !== 0 || t2 !== 1)
			for (const region of regions) {
				region.start.t = t1 + region.start.t * (t2 - t1);
				region.end.t = t1 + region.end.t * (t2 - t1);
			}

		return regions;
	}

	/**
	 * Flattens an array of line of sight intersection regions into a single collection of regions.
	 * @param {{ shape: import("../types").HeightMapShape; regions: import("../types").LineOfSightIntersectionRegion[] }[]} shapeRegions
	 * @returns {(import("../types").LineOfSightIntersectionRegion & { terrainTypeId: string; height: number; })[]}
	 */
	static flattenIntersectionRegions(shapeRegions) {
		/** @type {(import("../types").LineOfSightIntersectionRegion & { terrainTypeId: string; height: number; })[]} */
		const flatIntersections = [];

		// Find all points where a change happens - this may be entering, leaving or touching a shape.
		const boundaries = distinctBy(
				shapeRegions.flatMap(s => s.regions.flatMap(r => [r.start, r.end])),
				r => r.t
			).sort((a, b) => a.t - b.t);

		/** @type {{ x: number; y: number; h: number; t: number; }} */
		let lastPosition = undefined; // first boundary should always have 0 'active regions'

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
			const { t, h } = boundary;
			const activeRegions = shapeRegions
				.map(({ shape, regions }) => ({ shape, region: regions.find(r => r.start.t < t && r.end.t >= t) }))
				.filter(({ region }) => !!region);

			// If there is no active region, don't add an element to the intersections array, just move the position on.
			// There should only be 1 or 2 active regions. If there are two, that means that the ray 'skimmed' between
			// two adjacent shapes. In this case, this is an intersection, NOT a skim.
			if (activeRegions.length > 0) {
				// In the case of multiple, the resulting elevation is the lowest shape, and the height is the distance
				// from the lowest shape to the highest shape
				const elevation = Math.min.apply(null, activeRegions.map(r => r.shape.elevation));
				const height = Math.max.apply(null, activeRegions.map(r => r.shape.height + r.shape.elevation)) - elevation;

				flatIntersections.push({
					start: lastPosition,
					end: boundary,
					terrainTypeId: activeRegions[0].shape.terrainTypeId, // there's no good way to resolve this for multiple shapes, so just use whichever happens to be first
					height,
					elevation,
					skimmed: activeRegions.length === 1 && activeRegions[0].region.skimmed
				});
			}

			lastPosition = boundary;
		}

		return flatIntersections;
	}
}
