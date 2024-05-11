import { flags, moduleName } from "../consts.mjs";
import { distinctBy, groupBy } from '../utils/array-utils.mjs';
import { debug, error } from '../utils/log.mjs';
import { getTerrainTypeMap, getTerrainTypes } from '../utils/terrain-types.mjs';
import { LineSegment } from "./line-segment.mjs";
import { Polygon } from './polygon.mjs';
import { Point } from './point.mjs';

/**
 * @typedef {object} HeightMapShape Represents a shape that can be drawn to the map. It is a closed polygon that may
 * have one or more holes within it.
 * @property {Polygon} polygon The polygon that makes up the perimeter of this shape.
 * @property {Polygon[]} holes Other additional polygons that make holes in this shape.
 * @property {string} terrainTypeId
 * @property {number} height
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
			const polygons = cells.map(({ position }) => ({ cell: position, poly: HeightMap.#getPolyPoints(...position) }));

			// Combine connected grid-sized polygons into larger polygons where possible
			this.#shapes.push(...HeightMap.#combinePolygons(polygons, terrainTypeId, height));
		}

		const t2 = performance.now();
		debug(`Shape calculation took ${t2 - t1}ms`);
	}

	/**
	 * For the cell at the given x and y grid coordinates, returns the points to draw a poly at that location.
	 * The points are returned in a clockwise direction.
	 * @param {number} cx X cordinates of the cell to get points for.
	 * @param {number} cy Y cordinates of the cell to get points for.
	 * @returns {Polygon}
	 */
	static #getPolyPoints(cx, cy) {
		// Gridless is not supported
		if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

		const [x, y] = game.canvas.grid.grid.getPixelsFromGridPosition(cx, cy);

		// Can get the points for a square grid easily
		if (game.canvas.grid.type === CONST.GRID_TYPES.SQUARE) {
			const { w, h } = game.canvas.grid;
			return new Polygon([
				new Point(x, y),
				new Point(x + w, y),
				new Point(x + w, y + h),
				new Point(x, y + h)
			]);
		}

		// For hex grids, can use the getPolygon function to generate them for us
		const pointsFlat = game.canvas.grid.grid.getPolygon(x, y)
		const polygon = new Polygon();
		for (let i = 0; i < pointsFlat.length; i += 2) {
			polygon.pushVertex(new Point(pointsFlat[i], pointsFlat[i + 1]));
		}
		return polygon;
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
						.map(({ edge, idx }) => ({ angle: edge.angleBetween(edges[edges.length - 1]), idx }))
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
	 * @param {{ x: number; y: number; h: number; }} p1 The first point, where `x` and `y` are pixel coordinates.
	 * @param {{ x: number; y: number; h: number; }} p2 The second point, where `x` and `y` are pixel coordinates.
	 * @param {Object} [options={}] Options that change how the calculation is done.
	 * @param {boolean} [options.includeNoHeightTerrain=false] If true, terrain types that are configured as not using a
	 * height value will be included in the return list. They are treated as having infinite height.
	 * @returns TODO: <----------------------- DOCUMENT THIS (AND THE RETURNS ON THE PUBLIC API DOCS) -------------------------------------------------!!!!
	 */
	calculateLineOfSight(p1, p2, { includeNoHeightTerrain = false } = {}) {
		const [{ x: x1, y: y1, h: h1 }, { x: x2, y: y2, h: h2 }] = [p1, p2];

		/**
		 * Calculates the height of the line-of-sight ray at a specific t value.
		 * @param {number} t
		 */
		const lerpLosHeight = t => (h2 - h1) * t + h1;

		/**
		 * Calculates a lerp value for the line-of-sight ray based on the given height.
		 * @param {number} h
		 */
		const inverseLerpLosHeight = h => (h - h1) / (h2 - h1);

		const terrainTypes = getTerrainTypeMap();

		const testLine = LineSegment.fromCoords(x1, y1, x2, y2);

		/**
		 * Offset for `t` to use to calculate whether we are inside or outside the polygons during intersections.
		 * Aim for approximately 1/10th of the grid size
		 */
		const eeOffset = (game.canvas.grid.size / 10) / testLine.length;

		/** @type {{ t: number; shape: HeightMapShape; usesHeight: boolean; isEntry: boolean; }[]} */
		const intersections = [];

		for (const shape of this.#shapes) {
			// Ignore shapes of deleted terrain types
			if (!terrainTypes.has(shape.terrainTypeId)) continue;

			const { usesHeight } = terrainTypes.get(shape.terrainTypeId);

			// If this shape has a no-height terrain, only test for intersections if we are includeNoHeightTerrain
			if (!usesHeight && !includeNoHeightTerrain) continue;

			// If the shape is shorter than both the start and end heights, then we can skip the intersection tests as
			// the line of sight ray would never cross at the required height for a collision.
			// E.G. a ray from height 2 to height 3 would never intersect a terrain of height 1.
			if (usesHeight && shape.height < h1 && shape.height < h2) continue;

			// Loop each edge in this shape and check for an intersection. Record height, shape and how far along the
			// test line the intersection occured.
			const allEdges = shape.polygon.edges
				.map(e => /** @type {[Polygon | undefined, LineSegment]} */ ([undefined, e]))
				.concat(shape.holes
					.flatMap(h => h.edges.map(e => /** @type {[Polygon, LineSegment]} */ ([h, e]))));

			for (const [hole, edge] of allEdges) {
				const intersection = testLine.intersectsAt(edge);
				if (!intersection) continue;

				// Check whether this intersection happens below the height of the LOS ray.
				// If it does, then the collision would not have occured.
				const losHeightAtIntersection = lerpLosHeight(intersection.t)
				if (usesHeight && losHeightAtIntersection >= shape.height) continue;

				// To work out whether the collision is due to entering or leaving the shape, step forward a miniscule
				// amount on the `t` value, work out the X,Y of that point, then test if that point is in the shape.
				const testPoint = testLine.lerp(intersection.t + eeOffset);

				// If hole undefined, the edge is part of the outer polygon so check if the polygon contains that point.
				// If hole is not undefined, edge is part of a hole so check if the hole DOES NOT contain the point.
				const isEntry = hole === undefined
					? shape.polygon.containsPoint(...testPoint, true)
					: !hole.containsPoint(...testPoint, true);

				intersections.push({ t: intersection.t, shape, usesHeight, isEntry });
			}
		}

		// Next, we need to check for leaving a shape from the top: For any shape (that uses heights) that we have
		// intersected with, work out the `t` position where the LOS ray crosses the height of that shape.
		// E.G. for a height 3 shape, work out the `t` value where the LOS ray has a height of 3.
		// Then, we can lerp the X,Y position of this ray when it is at this t value.
		// Finally, we can take that X,Y position and check whether it is inside the shape or not (counting holes also).
		// Since this is the top of the shape, the intersection is an entry if the ray is going downwards, else an exit.
		// Note that we only need to do this is if there is a height difference in the LOS ray.
		if (h1 !== h2) {
			const intersectedShapes = new Set(intersections.filter(i => i.usesHeight).map(i => i.shape));
			const isEntry = h1 > h2;
			for (const shape of intersectedShapes) {
				const t = inverseLerpLosHeight(shape.height);
				if (t < 0 || t > 1) continue;

				const testLinePointAtHeight = testLine.lerp(t);

				if (shape.polygon.containsPoint(...testLinePointAtHeight) && !shape.holes.some(h => h.containsPoint(...testLinePointAtHeight)))
					intersections.push({ t, shape, usesHeight: true, isEntry });
			}
		}

		// Sort the intersections based on `t`, with ties being sorted by exit intersections first, then entry ones.
		intersections.sort((a, b) => {
			if (a.t !== b.t) return a.t - b.t;
			if (a.isEntry !== b.isEntry) return a.isEntry ? 1 : -1;
			return 0;
		});

		// DEBUG
		const g = canvas.terrainHeightLayer._graphics.graphics;

		g.lineStyle({ color: 0xFFFF00, width: 1 });
		g.moveTo(x1, y1);
		g.lineTo(x2, y2);

		intersections.forEach(i => {
			debug(`Intersection detected with a h ${i.shape.height} object at ${i.t} (${i.isEntry ? "entry" : "exit"})`);

			g.lineStyle({ width: 0 });
			g.beginFill(i.isEntry ? 0x00FF00 : 0xFF0000);
			g.drawCircle(...testLine.lerp(i.t), 3);
		});
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
