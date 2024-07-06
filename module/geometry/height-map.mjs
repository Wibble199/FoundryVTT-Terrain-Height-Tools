import { flags, moduleName } from "../consts.mjs";
import { distinctBy, groupBy } from '../utils/array-utils.mjs';
import { debug, error, warn } from '../utils/log.mjs';
import { getTerrainTypeMap, getTerrainTypes } from '../utils/terrain-types.mjs';
import { LineSegment } from "./line-segment.mjs";
import { Polygon } from './polygon.mjs';
import { getGridCellPolygon } from "../utils/grid-utils.mjs";
import { roundTo } from '../utils/misc-utils.mjs';

/**
 * @typedef {object} HeightMapShape Represents a shape that can be drawn to the map. It is a closed polygon that may
 * have one or more holes within it.
 * @property {Polygon} polygon The polygon that makes up the perimeter of this shape.
 * @property {Polygon[]} holes Other additional polygons that make holes in this shape.
 * @property {string} terrainTypeId
 * @property {number} height
 */

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
 * ray and a shape on the height map.
 * @property {{ x: number; y: number; h: number; t: number; }} start The start position of the intersection region.
 * @property {{ x: number; y: number; h: number; t: number; }} end The end position of the intersection region.
 * @property {boolean} skimmed Did this intersection region "skim" the shape - i.e. just barely touched the edge of the
 * shape rather than entering it completely.
 */

const maxHistoryItems = 10;

export class HeightMap {

	/** @type {{ position: [number, number]; terrainTypeId: string; height: number; }[]} */
	data;

	/** @type {{ position: [number, number]; terrainTypeId: string | undefined; height: number | undefined; }[][]} */
	_history = [];

	/** @type {HeightMapShape[]} */
	#shapes = [];

	/** @param {Scene} */
	constructor(scene) {
		/** @type {Scene} */
		this.scene = scene;
		this.reload();
	}

	/**
	 * The resulting complex shapes that make up the parts of the map.
	 * This property is calculated and the returned array should not be modified.
	 * @type {readonly HeightMapShape[]}
	 */
	get shapes() {
		return [...this.#shapes];
	}

	/**
	 * Reloads the data from the scene.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	reload() {
		this.data = this.scene.getFlag(moduleName, flags.heightData) ?? [];
		this._recalculateShapes();
	}

	/**
	 * Gets the height data exists at the given position, or `undefined` if it does not exist.
	 * @param {number} row
	 * @param {number} col
	 */
	get(row, col) {
		return this.data.find(({ position }) => position[0] === row && position[1] === col);
	}

	// -------------- //
	// Painting tools //
	// -------------- //
	/**
	 * Attempts to paint multiple cells at the given position.
	 * @param {[number, number][]} cells A list of cells to paint.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async paintCells(cells, terrainTypeId, height = 1) {
		/** @type {this["_history"][number]} */
		const history = [];
		let anyAdded = false;

		for (const cell of cells) {
			const existing = this.get(...cell);
			if (existing && existing.terrainTypeId === terrainTypeId && existing.height === height) continue;

			history.push({ position: cell, terrainTypeId: existing?.terrainTypeId, height: existing?.height });
			if (existing) {
				existing.height = height;
				existing.terrainTypeId = terrainTypeId;
			} else {
				this.data.push({ position: cell, terrainTypeId, height });
				anyAdded = true;
			}
		}

		if (anyAdded)
			this.#sortData();

		if (history.length > 0) {
			this.#pushHistory(history);
			await this.#saveChanges();
			this._recalculateShapes();
		}

		return history.length > 0;
	}

	/**
	 * Performs a fill from the given cell's location.
	 * @param {[number, number]} startCell The cell to start the filling from.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async fillCells(startCell, terrainTypeId, height) {
		// If we're filling the same as what's already here, do nothing
		const { terrainTypeId: startTerrainTypeId, height: startHeight } = this.get(...startCell) ?? {};
		if (startTerrainTypeId === terrainTypeId && startHeight === height) return [];

		const cellsToPaint = this.#findFillCells(startCell);
		if (cellsToPaint.length === 0) return false;
		return this.paintCells(cellsToPaint, terrainTypeId, height);
	}

	/**
	 * Attempts to erase data from multiple cells at the given position.
	 * @param {[number, number][]} cells
	 * @returns `true` if the map was updated and needs to be re-drawn, false otherwise.
	 */
	async eraseCells(cells) {
		/** @type {this["_history"][number]} */
		const history = [];

		for (const cell of cells) {
			const idx = this.data.findIndex(({ position }) => position[0] === cell[0] && position[1] === cell[1]);
			if (idx === -1) continue;

			history.push({ position: cell, terrainTypeId: this.data[idx].terrainTypeId, height: this.data[idx].height });
			this.data.splice(idx, 1);
		}

		if (history.length > 0) {
			this.#pushHistory(history);
			await this.#saveChanges();
			this._recalculateShapes();
		}

		return history.length > 0;
	}

	/**
	 * Performs an erasing fill operation from the given cell's location.
	 * @param {[number, number]} startCell The cell to start the filling from.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async eraseFillCells(startCell) {
		const cellsToErase = this.#findFillCells(startCell);
		if (cellsToErase.length === 0) return false;
		return this.eraseCells(cellsToErase);
	}

	async clear() {
		if (this.data.length === 0) return false;
		this.data = [];
		await this.#saveChanges();
		this.#shapes = [];
		return true;
	}


	// -------- //
	// Geometry //
	// -------- //
	_recalculateShapes() {
		this.#shapes = [];

		// Gridless scenes not supported
		if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return;

		const t1 = performance.now();

		for (const [, cells] of groupBy(this.data, x => `${x.terrainTypeId}.${x.height}`)) {
			const { terrainTypeId, height } = cells[0];

			// Get the grid-sized polygons for each cell at this terrain type and height
			const polygons = cells.map(({ position }) => ({ cell: position, poly: new Polygon(getGridCellPolygon(...position)) }));

			// Combine connected grid-sized polygons into larger polygons where possible
			this.#shapes.push(...HeightMap.#combinePolygons(polygons, terrainTypeId, height));
		}

		const t2 = performance.now();
		debug(`Shape calculation took ${t2 - t1}ms`);
	}

	/**
	 * Given a list of polygons, combines them together into as few polygons as possible.
	 * @param {{ poly: Polygon; cell: [number, number] }[]} originalPolygons An array of polygons to merge
	 * @param {string} terrainTypeId The terrainTypeId value of the given polygons. Only used to populate the metadata.
	 * @param {number} height The height value of the given polygons. Only used to populate the metadata.
	 * @returns {{ poly: Polygon; holes: Polygon[] }[]}
	 */
	static #combinePolygons(originalPolygons, terrainTypeId, height) {

		// Generate a graph of all edges in all the polygons
		const allEdges = originalPolygons.flatMap(p => p.poly.edges);

		// Remove any duplicate edges
		for (let i = 0; i < allEdges.length; i++) {
			for (let j = i + 1; j < allEdges.length; j++) {
				if (allEdges[i].equals(allEdges[j])) {
					allEdges.splice(j, 1);
					allEdges.splice(i, 1);
					i--;
					break;
				}
			}
		}

		// From some start edge, keep finding the next edge that joins it until we are back at the start.
		// If there are multiple edges starting at a edge's endpoint (e.g. two squares touch by a corner), then
		// use the one that most clockwise.
		/** @type {Polygon[]} */
		const combinedPolygons = [];
		while (allEdges.length) {
			// Find the next unvisited edge, and follow the edges until we join back up with the first
			const edges = allEdges.splice(0, 1);
			while (!edges[0].p1.equals(edges[edges.length - 1].p2)) {
				// To find the next edge, we find edges that start where the last edge ends.
				// For hex grids (where a max of 3 edges can meet), there will only ever be 1 other edge here (as if
				// there were 4 edges, 2 would've overlapped and been removed) so we can just use that edge.
				// But for square grids, there may be two edges that start here. In that case, we want to find the one
				// that is next when rotating counter-clockwise.
				const nextEdgeCandidates = allEdges
					.map((edge, idx) => ({ edge, idx }))
					.filter(({ edge }) => edge.p1.equals(edges[edges.length - 1].p2));

				if (nextEdgeCandidates.length === 0)
					throw new Error("Invalid graph detected. Missing edge.");

				const nextEdgeIndex = nextEdgeCandidates.length === 1
					? nextEdgeCandidates[0].idx
					: nextEdgeCandidates
						.map(({ edge, idx }) => ({ angle: edges[edges.length - 1].angleBetween(edge), idx }))
						.sort((a, b) => a.angle - b.angle)[0].idx;

				const [nextEdge] = allEdges.splice(nextEdgeIndex, 1);
				edges.push(nextEdge);
			}

			// Add completed polygon to the list
			combinedPolygons.push(new Polygon(edges.map(v => v.p1)));
		}

		// To determine if a polygon is a "hole" we need to check whether it is inside another polygon.
		// Since the polygon vertices are always the same direction, we can use to determine whether it is a hole: if
		// the points are going clockwise, then it IS NOT a hole, but if they are anti-clockwise then it IS a hole.
		// For each hole, we need to find which polygon it is a hole in, as the hole must be drawn immediately after.
		// To find the hole's parent, we search back up the sorted list of polygons in reverse for the first one that
		// contains it.
		/** @type {Map<boolean, typeof combinedPolygons>} */
		const polysAreHolesMap = groupBy(combinedPolygons, polygon => !polygon.edges[0].clockwise);

		const solidPolygons = (polysAreHolesMap.get(false) ?? [])
			.map(p => /** @type {HeightMapShape} */ ({
				polygon: p,
				holes: [],
				terrainTypeId,
				height
			}));

		const holePolygons = polysAreHolesMap.get(true) ?? [];

		// For each hole, we need to check which non-hole poly it is inside. We gather a list of non-hole polygons that
		// contains it. If there is only one, we have found which poly it is a hole of. If there are more, we imagine a
		// horizontal line drawn from the topmost point of the inner polygon (with a little Y offset added so that we
		// don't have to worry about vertex collisions) to the left and find the first polygon that it intersects.
		for (const holePolygon of holePolygons) {
			const containingPolygons = solidPolygons.filter(p => p.polygon.containsPolygon(holePolygon));

			if (containingPolygons.length === 0) {
				error("Something went wrong calculating which polygon this hole belonged to: No containing polygons found.", { holePolygon, solidPolygons });
				throw new Error("Could not find a parent polygon for this hole.");

			} else if (containingPolygons.length === 1) {
				containingPolygons[0].holes.push(holePolygon);

			} else {
				const testPoint = holePolygon.vertices
					.find(p => p.y === holePolygon.boundingBox.y1)
					.offset({ y: game.canvas.grid.h * 0.05 });

				const intersectsWithEdges = containingPolygons.flatMap(shape => shape.polygon.edges
					.map(edge => ({
						intersectsAt: edge.intersectsYAt(testPoint.y),
						shape
					}))
					.filter(x => x.intersectsAt && x.intersectsAt < testPoint.x)
				);

				if (intersectsWithEdges.length === 0) {
					error("Something went wrong calculating which polygon this hole belonged to: No edges intersected horizontal ray.", { holePolygon, solidPolygons });
					throw new Error("Could not find a parent polygon for this hole.");
				}

				intersectsWithEdges.sort((a, b) => b.intersectsAt - a.intersectsAt);
				intersectsWithEdges[0].shape.holes.push(holePolygon);
			}
		}

		return solidPolygons;
	}


	// ------------- //
	// Line of sight //
	// ------------- //
	/**
	 * Calculates the line of sight between the two given pixel coordinate points and heights.
	 * Returns an array of all shapes that were intersected, along with the regions where those shapes were intersected.
	 * @param {{ x: number; y: number; h: number; }} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {{ x: number; y: number; h: number; }} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {Object} [options={}] Options that change how the calculation is done.
	 * @param {boolean} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a
	 * height value will be included in the return list. They are treated as having infinite height.
	 * @param {boolean} [options.detectSkimming=true] If true, additional calculations are performed to detemine which
	 * regions of the line of sight ray are skimming shapes.
	 * @returns {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]}
	 */
	calculateLineOfSight(p1, p2, { includeNoHeightTerrain = false, detectSkimming = true } = {}) {
		const terrainTypes = getTerrainTypeMap();

		/** @type {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]} */
		const intersectionsByShape = [];

		for (const shape of this.#shapes) {
			// Ignore shapes of deleted terrain types
			if (!terrainTypes.has(shape.terrainTypeId)) continue;

			const { usesHeight } = terrainTypes.get(shape.terrainTypeId);

			// If this shape has a no-height terrain, only test for intersections if we are includeNoHeightTerrain
			if (!usesHeight && !includeNoHeightTerrain) continue;

			const regions = HeightMap.getIntersectionsOfShape(shape, p1, p2, usesHeight, { detectSkimming });
			if (regions.length > 0)
				intersectionsByShape.push({ shape, regions });
		}

		return intersectionsByShape;
	}

	/**
	 * Determines intersections of a ray from p1 to p2 for the given shape.
	 * @param {HeightMapShape} shape
	 * @param {{ x: number; y: number; h: number; }} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {{ x: number; y: number; h: number; }} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {boolean} usesHeight Whether or not the terrain type assigned to the shape utilises height or not.
	 * @param {Object} [options={}]
	 * @param {boolean} [options.detectSkimming=true] Whether or not to perform additional calculations to work out the
	 * skim regions.
	 */
	static getIntersectionsOfShape(shape, p1, p2, usesHeight, { detectSkimming = true } = {}) {
		const [{ x: x1, y: y1, h: h1 }, { x: x2, y: y2, h: h2 }] = [p1, p2];

		// If the shape is shorter than both the start and end heights, then we can skip the intersection tests as
		// the line of sight ray would never cross at the required height for an intersection.
		// E.G. a ray from height 2 to height 3 would never intersect a terrain of height 1.
		if (usesHeight && shape.height < h1 && shape.height < h2) return [];

		const testRay = LineSegment.fromCoords(x1, y1, x2, y2);
		const inverseTestRay = testRay.inverse();

		const lerpLosHeight = (/** @type {number} */ t) => (h2 - h1) * t + h1;
		const inverseLerpLosHeight = (/** @type {number} */ h) => (h - h1) / (h2 - h1);

		/** @type {LineOfSightIntersection[]} */
		const intersections = [];

		/** @type {LineOfSightIntersection} */
		let verticalIntersection = undefined;

		// Loop each edge in this shape and check for an intersection. Record height, shape and how far along the
		// test line the intersection occured.
		const allEdges = shape.polygon.edges
			.map(e => /** @type {[Polygon | undefined, LineSegment]} */ ([undefined, e]))
			.concat(shape.holes
				.flatMap(h => h.edges.map(e => /** @type {[Polygon, LineSegment]} */ ([h, e]))));

		for (const [hole, edge] of allEdges) {
			const intersection = testRay.intersectsAt(edge);
			if (!intersection) continue;

			// Check whether this intersection happens below the height of the LOS ray.
			// If it does, then the collision would not have occured.
			const losHeightAtIntersection = lerpLosHeight(intersection.t)
			if (usesHeight && losHeightAtIntersection > shape.height) continue;

			intersections.push({ ...intersection, edge, hole });
		}

		// Next, we need to check for leaving the shape from the top: work out the `t` position where the LOS ray crosses
		// the height of the shape. E.G. for a height 3 shape, work out the `t` value where the LOS ray has a height of 3.
		// Then, we can lerp the X,Y position of this ray when it is at this t value.
		// Finally, we can take that X,Y position and check whether it is inside the shape or not (counting holes also).
		// Note that we only need to do this is if there is a height difference in the LOS ray.
		if (h1 !== h2 && usesHeight) {
			const t = inverseLerpLosHeight(shape.height);
			if (t >= 0 && t <= 1) {
				const testLinePointAtHeight = testRay.lerp(t);
				if (shape.polygon.containsPoint(testLinePointAtHeight.x, testLinePointAtHeight.y) && !shape.holes.some(h => h.containsPoint(testLinePointAtHeight.x, testLinePointAtHeight.y)))
					verticalIntersection = {
						x: testLinePointAtHeight.x,
						y: testLinePointAtHeight.y,
						t,
						u: undefined,
						edge: undefined,
						hole: undefined
					};
			}
		}

		// Next to use these intersections to determine the regions where an intersection is occuring.
		/** @type {LineOfSightIntersectionRegion[]} */
		const regions = [];

		// There may be multiple intersections at an equal point along the test ray (t) - for example when touching a vertex
		// of a shape - it'll intersect both edges of the vertex. These are a special case and need to be handled
		// differently, so group everything by t.
		// We also include the vertical intersection (if there is one) in this list to get processed also (needs to get
		// sorted with the rest before being processed), however we don't want to include it in the group as we don't ever
		// want a case where the vertical and an edge intersection happen at the same time and get treated as a two-edge
		// intersection.
		/** @type {[number, LineOfSightIntersection[]] | undefined} */
		const verticalIntersectionGroup = verticalIntersection
			? [roundTo(verticalIntersection.t, Number.EPSILON), [verticalIntersection]]
			: undefined;
		const intersectionsByT = [
				...groupBy(intersections, i => roundTo(i.t, Number.EPSILON)).entries(),
				...[verticalIntersectionGroup].filter(Boolean)
			]
			.sort(([a], [b]) => a - b) // sort by t
			.map(([, intersections]) => intersections);

		// Determine if the start point of the test ray is inside or outside the shape, taking height into account.
		let isInside = (!usesHeight || p1.h <= shape.height)
			&& shape.polygon.containsPoint(p1.x, p1.y, { containsOnEdge: false })
			&& !shape.holes.some(h => h.containsPoint(p1.x, p1.y, { containsOnEdge: true }));

		// If the test ray is flat in the height direction and this shape's height = the test ray height, then whenever we
		// 'enter' the shape, we're actually going to be skimming the top.
		const isSkimmingTop = detectSkimming && usesHeight && p1.h === p2.h && p1.h === shape.height;

		let lastIntersectionPosition = { x: p1.x, y: p1.y, h: p1.h, t: 0 };

		/** @param {{ x: number; y: number; t: number; allowZeroLength: boolean }} param0 */
		const pushRegion = ({ x, y, t, allowZeroLength = false }) => {
			if (!allowZeroLength && t === lastIntersectionPosition.t) return;
			const position = { x, y, t, h: lerpLosHeight(t) };
			if (isInside) {
				regions.push({
					start: lastIntersectionPosition,
					end: position,
					skimmed: isSkimmingTop
				});
			}
			lastIntersectionPosition = position;
		};

		/** @param {LineOfSightIntersection} param0 */
		const handleEdgeIntersection = ({ edge, x, y, t, u }) => {
			pushRegion({ x, y, t });

			if (u < Number.EPSILON) {
				// If we've intersected at the start of the shape's edge, check the angle of the previous edge.
				// This edge will be parallel to the test ray (else it would have also caused an intersection).
				// If the angle is the same as the test ray (i.e. the edge is going the same direction), then we
				// have entered a skimming section.
				const previousEdge = shape.polygon.previousEdge(edge)
					?? shape.holes.map(h => h.previousEdge(edge)).find(Boolean);

				// Get the angle between previous and current edge, and between the previous edge and the test ray. If
				// the ray angle is between that angle, then it has entered. This is similar to the logic we use for
				// vertex intersections.
				isInside = previousEdge.angleBetween(testRay) < previousEdge.angleBetween(edge);

			} else if (u > 1 - Number.EPSILON) {
				// If we've intersected at the end of the shape's edge, check the angle for the next edge, similar to
				// how we do for when u = 0.
				const nextEdge = shape.polygon.nextEdge(edge)
					?? shape.holes.map(h => h.nextEdge(edge)).find(Boolean);

				isInside = edge.angleBetween(testRay) < edge.angleBetween(nextEdge);

			} else {
				// For any other values of u, this was a clean intersection, so just toggle isInside
				isInside = !isInside;
			}
		};

		for (const intersectionsOfT of intersectionsByT) {
			switch (intersectionsOfT.length) {
				// In the case of a single intersection, then we have either crossed an edge cleanly, or we have
				// hit a vertex where one of the edges is parallel to the test ray.
				case 1: {
					handleEdgeIntersection(intersectionsOfT[0]);
					break;
				}

				// In the case of two intersections, we have hit a vertex where neither edge are parallel to the
				// test ray.
				case 2: {
					// In most cases, edge2 will start where edge1 ends. So when working out the angle between
					// it works fine. However, in cases where the first and last edges defined on a shape are
					// intersected, edge1 will actually be the one that begins where edge2 ends. In this case
					// we need to swap them round for the calculations to work properly.
					let [{ edge: edge1 }, { edge: edge2 }] = intersectionsOfT;
					if (edge1.p1.equals(edge2.p2)) [edge1, edge2] = [edge2, edge1];

					// To determine if we we can treat this is an edge intersection, either: the ray's angle must be between
					// the angle between edge1 and edge2 and the inverse ray's angle must not, or vice versa. If the ray and
					// the inverse angles are both outside or both inside, then we have a 'skimming' vertex intersection.
					const angleInside = edge1.angleBetween(edge2);
					const rayInside = edge1.angleBetween(testRay) < angleInside;
					const inverseRayInside = edge1.angleBetween(inverseTestRay) < angleInside;
					const treatAsEdgeIntersection = rayInside !== inverseRayInside;

					// If so, then we can treat it as if it was an edge intersection.
					// If not, then we skimmed the shape at a corner, so add a zero-length skim region.
					if (treatAsEdgeIntersection) {
						handleEdgeIntersection(intersectionsOfT[0]);
					} else {
						pushRegion({ ...intersectionsOfT[0], allowZeroLength: true })
					}

					break;
				}

				// In any other case we don't know what to do. These should be very rare so for now I think it's
				// fine to leave as just a warning and ignore it.
				// This can happen for example on a square grid when the shape has two vertices touching one
				// another and the line crosses at this vertex.
				// Shouldn't be possible on a hex grid?
				default:
					warn(`Edge case occured when performing line of sight calculation: the line of sight ray met a shape and caused ${intersectionsOfT.length} intersections at the same point. This rare case is not currently supported and will likely give incorrect line of sight calculation results.`);
					break;
			}
		}

		// In case the last intersection was not at the end, ensure we close the region
		pushRegion({ x: p2.x, y: p2.y, t: 1 });

		// As a final step, need to calculate if any of the regions are 'skimmed' regions.
		// Note: this is done as an independent step as it allows us to add some tolerance without making a mess of the
		// normal intersection calculations. For example, adding some tolerance around the ends of lines can cause extra
		// intersections to occur when they otherwise wouldn't. This often gets more noticable on longer lines too.
		if (detectSkimming) {
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
				let { t: t1, distanceSquared: d1 } = testRay.findClosestPoint(edge.p1.x, edge.p1.y);
				t1 = Math.max(Math.min(t1, 1), 0);
				let { t: t2, distanceSquared: d2 } = testRay.findClosestPoint(edge.p2.x, edge.p2.y);
				t2 = Math.max(Math.min(t2, 1), 0);

				// If the two ends of the edge wouldn't be skimming, continue to next edge
				if (d1 > skimDistThresholdSquared || d2 > skimDistThresholdSquared || Math.abs(t1 - t2) <= Number.EPSILON)
					continue;

				// Check height of both ends is within the height of the shape.
				// If neither are, then this region isn't a skim so continue to next edge.
				// If only one is, figure out which and figure out which point the skimming stops and replace the out
				// of range t value with the interpolated value
				// If both are, no alteration needed
				const h1 = lerpLosHeight(t1);
				const h2 = lerpLosHeight(t2);

				if (h1 > shape.height && h2 > shape.height)
					continue;
				else if (h1 > shape.height) // h2 <= shape.height
					t1 = inverseLerpLosHeight(shape.height);
				else if (h2 > shape.height) // h1 <= shape.height
					t2 = inverseLerpLosHeight(shape.height);

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

						if (region.end.t < skimStartT)
							spliceRangeStart = j + 1;

						if (region.start.t > skimEndT && spliceRangeEnd > j)
							spliceRangeEnd = j;
					}

					const skimStartObject = { t: skimStartT, h: lerpLosHeight(skimStartT), ...testRay.lerp(skimStartT) };
					const skimEndObject = { t: skimEndT, h: lerpLosHeight(skimEndT), ...testRay.lerp(skimEndT) };

					// Actually remove the overlapping regions and insert the new regions
					/** @type {LineOfSightIntersectionRegion[]} */
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
		}

		return regions;
	}

	/**
	 * Flattens an array of line of sight intersection regions into a single collection of regions.
	 * @param {{ shape: HeightMapShape; regions: LineOfSightIntersectionRegion[] }[]} shapeRegions
	 * @returns {(LineOfSightIntersectionRegion & { terrainTypeId: string; height: number; })[]}
	 */
	static flattenLineOfSightIntersectionRegions(shapeRegions) {
		/** @type {(LineOfSightIntersectionRegion & { terrainTypeId: string; height: number; })[]} */
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
			// two adjacent shapes. In this case, we should actually only treat it as a skim if the height of the ray is
			// equal or above one of the shapes. If it is below both, then it is instead a full intersection
			if (activeRegions.length > 0) {
				flatIntersections.push({
					start: lastPosition,
					end: boundary,
					terrainTypeId: activeRegions[0].shape.terrainTypeId, // there's no good way to resolve this for multiple shapes, so just use whichever happens to be first
					height: Math.max.apply(null, activeRegions.map(r => r.shape.height)),
					skimmed: activeRegions.length > 1
					? (h >= activeRegions[0].shape.height || h >= activeRegions[1].shape.height)
						: activeRegions[0].region.skimmed
				});
			}

			lastPosition = boundary;
		}

		return flatIntersections;
	}


	// ------- //
	// History //
	// ------- //
	/**
	 * Pushes new history data onto the stack.
	 * @param {this["_history"][number]} historyEntry
	 */
	#pushHistory(historyEntry) {
		this._history.push(historyEntry);

		// Limit the number of changes we store in the history, removing old entries first
		while (this._history.length > maxHistoryItems)
			this._history.shift();
	}

	/**
	 * Undoes the most-recent change made to the height map.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async undo() {
		if (this._history.length <= 0) return false;

		const revertChanges = this._history.pop();
		let anyAdded = false;

		for (const revert of revertChanges) {
			const existingIndex = this.data.findIndex(({ position }) => position[0] === revert.position[0] && position[1] === revert.position[1]);

			// If the cell was un-painted before the change, and it now is painted, remove it
			if (revert.terrainTypeId === undefined && existingIndex >= 0) {
				this.data.splice(existingIndex, 1);
			}

			// If the cell was painted before the change, and is now painted, update it
			else if (revert.terrainTypeId !== undefined && existingIndex >= 0) {
				this.data[existingIndex].terrainTypeId = revert.terrainTypeId;
				this.data[existingIndex].height = revert.height;
			}

			// If the cell was painted before the change, and is now unpainted, add it
			else if (revert.terrainTypeId !== undefined && existingIndex === -1) {
				this.data.push({ ...revert });
				anyAdded = true;
			}
		}

		if (anyAdded) this.#sortData();

		this.#saveChanges();
		return true;
	}


	// ----- //
	// Utils //
	// ----- //
	/**
	 * Sorts the height data top to bottom, left to right. Required for the polygon/hole calculation to work properly,
	 * and should be done after any cells are inserted.
	 */
	#sortData() {
		this.data.sort(({ position: a }, { position: b }) => a[0] - b[0] || a[1] - b[1]);
	}

	async #saveChanges() {
		// Remove any cells that do not have a valid terrain type - e.g. if the terrain type was deleted
		const availableTerrainIds = new Set(getTerrainTypes().map(t => t.id));
		this.data = this.data.filter(x => availableTerrainIds.has(x.terrainTypeId));

		await this.scene.setFlag(moduleName, flags.heightData, this.data);
	}

	/**
	 * Calculates which cells would be affected if a fill operation started at the given startCell.
	 * @param {[number, number]} startCell The cell to start the filling from.
	 */
	#findFillCells(startCell) {
		const { terrainTypeId: startTerrainTypeId, height: startHeight } = this.get(...startCell) ?? {};

		// From the starting cell, visit all neighboring cells around it.
		// If they have the same configuration (same terrain type and height), then fill it and queue it to have this
		// process repeated for that cell.

		const visitedCells = new Set();
		const visitQueue = [startCell];

		/** @type {[number, number][]} */
		const cellsToPaint = [];

		const { width: canvasWidth, height: canvasHeight } = game.canvas.dimensions;

		while (visitQueue.length > 0) {
			const [nextCell] = visitQueue.splice(0, 1);

			// Don't re-visit already visited ones
			const cellKey = `${nextCell[0]}.${nextCell[1]}`;
			if (visitedCells.has(cellKey)) continue;
			visitedCells.add(cellKey);

			// Check cell is the same config
			const { terrainTypeId: nextTerrainTypeId, height: nextHeight } = this.get(...nextCell) ?? {};
			if (nextTerrainTypeId !== startTerrainTypeId || nextHeight !== startHeight) continue;

			cellsToPaint.push(nextCell);

			// Enqueue neighbors
			for (const neighbor of this.#getNeighboringFillCells(...nextCell)) {

				// Get the position of the cell, ignoring it if it falls off the canvas
				const [x, y] = game.canvas.grid.grid.getPixelsFromGridPosition(...neighbor);
				if (x + game.canvas.grid.w < 0) continue; // left
				if (x >= canvasWidth) continue; // right
				if (y + game.canvas.grid.h < 0) continue; // top
				if (y >= canvasHeight) continue; // bottom

				visitQueue.push(neighbor);
			}
		}

		return cellsToPaint;
	}

	/** @returns {[number, number][]} */
	#getNeighboringFillCells(x, y) {
		// For hex grids, we can use the default implementation, but for square cells the default returns all 8 cells,
		// but for filling purposes we only want the 4 orthogonal.
		if (game.canvas.grid.isHex)
			return game.canvas.grid.grid.getNeighbors(x, y);

		return [
			[x, y - 1],
			[x - 1, y],
			[x + 1, y],
			[x, y + 1]
		];
	}
}
