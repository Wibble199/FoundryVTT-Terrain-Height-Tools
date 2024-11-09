import { groupBy } from "../utils/array-utils.mjs";
import { error, warn } from "../utils/log.mjs";
import { roundTo } from "../utils/misc-utils.mjs";
import { encodeCellKey } from "./height-map.mjs";
import { LineSegment } from "./line-segment.mjs";
import { Polygon } from "./polygon.mjs";

/** @typedef {Polygon | ({ x: number; y: number; } | import("./point.mjs").Point)[]} InputPolygon */

/**
 * @typedef {object} LineOfSightIntersection
 * @property {number} x
 * @property {number} y
 * @property {number} t
 * @property {number} u
 * @property {LineSegment | undefined} edge
 * @property {Polygon | undefined} hole
 */

/**
 * @typedef {object} LineOfSightIntersectionRegion An object detailing the region of an intersection of a line of sight
 * ray and a height map shape.
 * @property {{ x: number; y: number; h: number; t: number; }} start The start position of the intersection region.
 * @property {{ x: number; y: number; h: number; t: number; }} end The end position of the intersection region.
 * @property {boolean} skimmed Did this intersection region "skim" the shape - i.e. just barely touched the edge of the
 * shape rather than entering it completely.
 * @property {-1 | 0 | 1} skimSide If a skim occured, which side of the test ray it occured. -1 = left, 1 = right, 0 =
 * top/bottom.
 */

/**
 * Represents a shape that can be drawn to the map.
 * It is a closed polygon that may have one or more holes within it.
 */
export class HeightMapShape {

	/**
	 * @param {Object} data
	 * @param {string} data.terrainTypeId
	 * @param {InputPolygon} data.polygon The polygon that makes up the perimeter of this shape.
	 * @param {InputPolygon[]} data.holes Other additional polygons that make holes in this shape.
	 * @param {number} data.height
	 * @param {number} data.elevation
	 * @param {Iterable<string>} data.cells A Set of all cells that this HeightMapShape consists of, stored as 'row.col'
	 */
	constructor({ terrainTypeId, polygon, holes = [], height, elevation = 0, cells }) {
		this.terrainTypeId = terrainTypeId;
		this.polygon = polygon instanceof Polygon ? polygon : new Polygon(polygon);
		this.holes = holes.map(hole => hole instanceof Polygon ? hole : new Polygon(hole));
		this.height = height;
		this.elevation = elevation;
		this.cells = new Set(cells);
	}

	get top() {
		return this.elevation + this.height;
	}

	get bottom() {
		return this.elevation;
	}

	/**
	 * @param {number} row
	 * @param {number} col
	 */
	containsCell(row, col) {
		return this.cells.has(encodeCellKey(row, col));
	}

	/**
	 * Determines intersections of a ray from p1 to p2 for this shape.
	 * @param {{ x: number; y: number; h: number; }} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {{ x: number; y: number; h: number; }} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {boolean} usesHeight Whether or not the terrain type assigned to the shape utilises height or not.
	 * skim regions.
	 */
	getIntersections(p1, p2, usesHeight) {
		// If the shape is shorter than both the start and end heights, then we can skip the intersection tests as
		// the line of sight ray would never cross at the required height for an intersection.
		// E.G. a ray from height 2 to height 3 would never intersect a terrain of height 1.
		const shapeTop = usesHeight ? this.elevation + this.height : Infinity;
		const shapeBottom = usesHeight ? this.elevation : -Infinity;
		if (usesHeight && p1.h > shapeTop && p2.h > shapeTop) return [];
		if (usesHeight && p1.h < shapeBottom && p2.h < shapeBottom) return [];

		// If the test ray extends above the height of the shape, instead stop it at that height
		const clampPoint = (/** @type {0|1} */ t) => {
			const inverseLerpLosHeight = (/** @type {number} */ h) => (h - p1.h) / (p2.h - p1.h);
			const p = [p1, p2][t];

			if (p.h > this.top)
				return {
					...LineSegment.lerp(p1.x, p1.y, p2.x, p2.y, inverseLerpLosHeight(this.top)),
					h: this.top,
					t: inverseLerpLosHeight(this.top)
				};

			if (p.h < this.bottom)
				return {
					...LineSegment.lerp(p1.x, p1.y, p2.x, p2.y, inverseLerpLosHeight(this.bottom)),
					h: this.bottom,
					t: inverseLerpLosHeight(this.bottom)
				};

			return { ...p, t };
		};

		const { x: x1, y: y1, h: h1, t: t1 = 0 } = usesHeight ? clampPoint(0) : p1;
		const { x: x2, y: y2, h: h2, t: t2 = 1 } = usesHeight ? clampPoint(1) : p2;

		const lerpLosHeight = (/** @type {number} */ t) => (h2 - h1) * t + h1;
		const testRay = LineSegment.fromCoords(x1, y1, x2, y2);
		const inverseTestRay = testRay.inverse();

		// Loop each edge in this shape and check for an intersection. Record height, shape and how far along the
		// test line the intersection occured.
		const allEdges = this.polygon.edges
			.map(e => /** @type {[Polygon | undefined, LineSegment]} */ ([undefined, e]))
			.concat(this.holes
				.flatMap(h => h.edges.map(e => /** @type {[Polygon, LineSegment]} */ ([h, e]))));

		/** @type {LineOfSightIntersection[]} */
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
				const previousEdge = (hole ?? this.polygon).previousEdge(edge);
				if (previousEdge.isParallelTo(testRay)) {
					intersections.push({ ...intersection, u: 1, edge: previousEdge, hole });
				}

			} else if (intersection.u > 1 - Number.EPSILON) {
				const nextEdge = (hole ?? this.polygon).nextEdge(edge);
				if (nextEdge.isParallelTo(testRay)) {
					intersections.push({ ...intersection, u: 0, edge: nextEdge, hole });
				}
			}
		}

		// Next to use these intersections to determine the regions where an intersection is occuring.
		/** @type {LineOfSightIntersectionRegion[]} */
		const regions = [];

		// There may be multiple intersections at an equal point along the test ray (t) - for example when touching a vertex
		// of a shape - it'll intersect both edges of the vertex. These are a special case and need to be handled
		// differently, so group everything by t.
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
					isInside = this.polygon.containsPoint(x1, y1, { containsOnEdge: false })
						&& !this.holes.some(h => h.containsPoint(x1, y1, { containsOnEdge: true }));
					break;

				case 1:
					// (Rename t to u because elsewhere we use t as the relative distance along the ray and u as the
					// relative distance along an edge, which is what we have here)
					const { edge, poly, t: u } = p1LiesOnEdges[0];

					if (u < Number.EPSILON) {
						const previousEdge = (poly ?? this.polygon).previousEdge(edge);
						isInside = previousEdge.angleBetween(testRay) < previousEdge.angleBetween(edge);

					} else if (u > 1 - Number.EPSILON) {
						const nextEdge = (poly ?? this.polygon).nextEdge(edge);
						isInside = edge.angleBetween(testRay) < edge.angleBetween(nextEdge);

					} else {
						const a = edge.angleBetween(testRay);
						isInside = a > 0 && a < Math.PI; // Do not count 0 or PI as inside because that means it's parallel
					}
					break;

				case 2:
					isInside = testRay.isBetween(p1LiesOnEdges[0].edge, p1LiesOnEdges[1].edge);
					break;

				case 4:
					// In the case of a 4-way intersection, loop over all the edges and see if the ray passes between
					// the relevant adjacent edge. This does mean we could end up testing all the edges twice (since the
					// relevant edge should already be in the array), but the code to try pair them up would be clunky,
					// and since it's only 4 basic maths operations it'll have no noticable impact on perf.
					isInside = p1LiesOnEdges.some(({ edge, poly, t: u }) => {
						if (u < Number.EPSILON) {
							const previousEdge = (poly ?? this.polygon).previousEdge(edge);
							return previousEdge.angleBetween(testRay) < previousEdge.angleBetween(edge);
						} else if (u > 1 - Number.EPSILON) {
							const nextEdge = (poly ?? this.polygon).nextEdge(edge);
							return edge.angleBetween(testRay) < edge.angleBetween(nextEdge);
						}
					});

					break;

				default:
					// Rare case when the ruler starts at an intersection of 4 edges. Should only be able to happen on
					// square grids when two vertices of the shape meet. For now, not sure what to do here :(
					warn(`Error when performing line of sight calculation: the line of sight ray starts at ${p1LiesOnEdges.length} vertices of a single shape, but expected 0, 1, 2, or 4. This case is not supported and will likely give incorrect line of sight calculation results.`);
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

				// In the case of two intersections, we have hit a vertex,
				case 2:
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

				// In the uncommon case of four intersections, we have hit a 4-way vertex on a square grid (not possible
				// on a hex grid).
				case 4:
					// In this case we don't actually need to do anything. The only time this can happen is on a square
					// grid, and for it to happen opposite corners must be painted (i.e. top left and bottom right; or
					// top right and bottom left). This means that whatever state the ray is in when it intersections,
					// it is the same when it comes out because it will end up in the same type of cell - painted or not
					break;

				// If anything else, then something has gone wrong. :(
				default:
					error(`Error occured when performing line of sight calculation: the line of sight ray met a shape and caused ${intersectionsOfT.length} intersections at the same point but expected either 1, 2, or 4. This case is not supported and will likely give incorrect line of sight calculation results.`);
					break;
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
			.map(([, edge]) => ({
				edge,
				isParallel: Math.abs(testRay.angle - edge.angle) < parallelThreshold,
				isInverseParallel: Math.abs(inverseTestRay.angle - edge.angle) < parallelThreshold
			}))
			.filter(x => x.isParallel || x.isInverseParallel);

		// For each edge that is parallel, check how far the ends are from the testRay (assuming testRay had
		// infinite length). If both are within a small threshold, then add it as a skimming region.
		const skimDistThresholdSquared = 16; // pixels
		/** @type {{ t1: number; t2: number; skimSide: -1 | 1; }[]} */
		const skimRegions = [];
		for (const { edge, isParallel } of parallelEdges) {
			// Cap the t values to 0-1 (i.e. on the testRay), but don't alter the distances.
			let { t: t1, distanceSquared: d1 } = testRay.findClosestPointOnLineTo(edge.p1.x, edge.p1.y);
			t1 = Math.max(Math.min(t1, 1), 0);
			let { t: t2, distanceSquared: d2 } = testRay.findClosestPointOnLineTo(edge.p2.x, edge.p2.y);
			t2 = Math.max(Math.min(t2, 1), 0);

			// If the two ends of the edge wouldn't be skimming, continue to next edge
			if (d1 > skimDistThresholdSquared || d2 > skimDistThresholdSquared || Math.abs(t1 - t2) <= Number.EPSILON)
				continue;

			const skimSide = isParallel ? 1 : -1;
			skimRegions.push(t1 < t2 ? { t1, t2, skimSide } : { t1: t2, t2: t1, skimSide });
		}

		skimRegions.sort((a, b) => a.t1 - b.t2);

		// Merge these regions with the overall intersection regions, combining any adjacent skim regions together
		// (combining may only happen on a square grid, would never occur on a hex grid)
		/** @type {number | undefined} */
		let skimStartT = undefined;
		for (let i = 0; i < skimRegions.length; i++) {

			// Merge adjacent skim regions. The combined skim region is from skimStartT -> skimRegions[i].t2.
			skimStartT ??= skimRegions[i].t1;
			if (i === skimRegions.length - 1 || Math.abs(skimRegions[i].t2 - skimRegions[i + 1].t1) > Number.EPSILON || skimRegions[i].skimSide !== skimRegions[i + 1].skimSide) {
				const skimEndT = skimRegions[i].t2;

				// We need to figure out which, if any, of the intersection regions to remove.
				// We also need to figure out if we're overlapping any of these intersection regions, and if so, we
				// want to remove it but also insert a new one up to that point. E.G. if a region was from t=0.2 to
				// t=0.4, and then a skim region was from t=0.3 to t=0.5, remove the existing intersection region
				// and add a new one from t=0.2 to t=0.3. Note that the start and end intersect regions may be the
				// same if the skim region does not fully overlap it.

				/** @type {LineOfSightIntersectionRegion | undefined} */
				let overlappingStartRegion = undefined;
				/** @type {LineOfSightIntersectionRegion | undefined} */
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
				/** @type {LineOfSightIntersectionRegion[]} */
				const newElements = [
					overlappingStartRegion
						? { ...overlappingStartRegion, end: skimStartObject }
						: undefined,
					{
						start: skimStartObject,
						end: skimEndObject,
						skimmed: true,
						skimSide: isSkimmingTopBottom ? 0 : skimRegions[i].skimSide
					},
					overlappingEndRegion
						? { ...overlappingEndRegion, start: skimEndObject }
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
}
