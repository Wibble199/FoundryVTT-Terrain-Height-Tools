import { flags, moduleName } from "../consts.mjs";
import { groupBy } from '../utils/array-utils.mjs';
import { getGridCellPolygon } from "../utils/grid-utils.mjs";
import { debug, error } from '../utils/log.mjs';
import { Signal } from "../utils/reactive.mjs";
import { getTerrainType, getTerrainTypes } from '../utils/terrain-types.mjs';
import { Polygon } from './polygon.mjs';

const maxHistoryItems = 10;

export class HeightMap {

	/** @type {Scene} */
	#scene;

	/** @type {{ position: [number, number]; terrainTypeId: string; height: number; elevation: number; }[]} */
	#data = [];

	/** @type {{ position: [number, number]; terrainTypeId: string | undefined; height: number | undefined; elevation: number; }[][]} */
	#history = [];

	/** @type {Signal<import("../types").HeightMapShape[]>} */
	shapes$ = new Signal([]);

	/**
	 * The currently active scene's HeightMap
	 * @type {HeightMap | undefined}
	 */
	static current;

	/** @param {Scene} scene */
	constructor(scene) {
		this.#scene = scene;
		this.reload();
		Hooks.on("updateScene", this.#onSceneUpdate);
	}

	destroy() {
		Hooks.off("updateScene", this.#onSceneUpdate);
	}

	/** @param {Scene} scene */
	#onSceneUpdate = scene => {
		// When any scene is updated, if it is the one this HeightMap is bound to, then update the HeightMap
		if (scene.id === this.#scene.id)
			this.reload();
	};

	/**
	 * Reloads the data from the scene.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	reload() {
		this.#data = (this.#scene.getFlag(moduleName, flags.heightData) ?? [])
			.map(cell => ({ elevation: 0, ...cell }));
		this.#recalculateShapes();
	}

	/**
	 * Gets the height data exists at the given position, or `undefined` if it does not exist.
	 * @param {number} row
	 * @param {number} col
	 */
	get(row, col) {
		return this.#data.find(({ position }) => position[0] === row && position[1] === col);
	}

	// -------------- //
	// Painting tools //
	// -------------- //
	/**
	 * Attempts to paint multiple cells at the given position.
	 * @param {[number, number][]} cells A list of cells to paint.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @param {Object} [options]
	 * @param {boolean} [options.overwrite] Whether or not to overwrite already-painted cells with hew terrain data.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async paintCells(cells, terrainTypeId, height = 1, elevation = 0, { overwrite = true } = {}) {
		/** @type {this["#history"][number]} */
		const history = [];
		let anyAdded = false;

		const { usesHeight } = getTerrainType(terrainTypeId);
		if (usesHeight && (typeof height !== "number" || height <= 0))
			throw new Error("`height` must be a positive, non-zero number.");
		if (usesHeight && (typeof elevation !== "number" || elevation < 0))
			throw new Error("`elevation` must be a positive number or zero.");

		for (const cell of cells) {
			const existing = this.get(...cell);
			if (existing && !overwrite) continue;
			if (existing && existing.terrainTypeId === terrainTypeId && existing.height === height && existing.elevation === elevation) continue;

			history.push({ position: cell, terrainTypeId: existing?.terrainTypeId, height: existing?.height, elevation: existing?.elevation });
			if (existing) {
				existing.height = height;
				existing.elevation = elevation;
				existing.terrainTypeId = terrainTypeId;
			} else {
				this.#data.push({ position: cell, terrainTypeId, height, elevation });
				anyAdded = true;
			}
		}

		if (anyAdded)
			this.#sortData();

		if (history.length > 0) {
			this.#pushHistory(history);
			await this.#saveChanges();
			this.#recalculateShapes();
		}

		return history.length > 0;
	}

	/**
	 * Performs a fill from the given cell's location.
	 * @param {[number, number]} startCell The cell to start the filling from.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @param {number} height The elevation of the terrain to paint.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async fillCells(startCell, terrainTypeId, height, elevation = 0) {
		// If we're filling the same as what's already here, do nothing
		const { terrainTypeId: startTerrainTypeId, height: startHeight } = this.get(...startCell) ?? {};
		if (startTerrainTypeId === terrainTypeId && startHeight === height) return [];

		const cellsToPaint = this.#findFillCells(startCell);
		if (cellsToPaint.length === 0) return false;
		return this.paintCells(cellsToPaint, terrainTypeId, height, elevation);
	}

	/**
	 * Attempts to erase data from multiple cells at the given position.
	 * @param {[number, number][]} cells
	 * @returns `true` if the map was updated and needs to be re-drawn, false otherwise.
	 */
	async eraseCells(cells) {
		/** @type {this["#history"][number]} */
		const history = [];

		for (const cell of cells) {
			const idx = this.#data.findIndex(({ position }) => position[0] === cell[0] && position[1] === cell[1]);
			if (idx === -1) continue;

			history.push({ position: cell, terrainTypeId: this.#data[idx].terrainTypeId, height: this.#data[idx].height });
			this.#data.splice(idx, 1);
		}

		if (history.length > 0) {
			this.#pushHistory(history);
			await this.#saveChanges();
			this.#recalculateShapes();
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
		if (this.#data.length === 0) return false;
		this.#data = [];
		await this.#saveChanges();
		this.shapes$.value = [];
		return true;
	}


	// -------- //
	// Geometry //
	// -------- //
	#recalculateShapes() {
		/** @type {import("../types").HeightMapShape[]} */
		const shapes = [];

		// Gridless scenes not supported
		if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return;

		const t1 = performance.now();

		for (const [, cells] of groupBy(this.#data, x => `${x.terrainTypeId}.${x.height}.${x.elevation}`)) {
			const { terrainTypeId, height, elevation } = cells[0];

			// Get the grid-sized polygons for each cell at this terrain type and height
			const polygons = cells.map(({ position }) => ({ cell: position, poly: new Polygon(getGridCellPolygon(...position)) }));

			// Combine connected grid-sized polygons into larger polygons where possible
			shapes.push(...HeightMap.#combinePolygons(polygons, terrainTypeId, height, elevation));
		}

		const t2 = performance.now();
		debug(`Shape calculation took ${t2 - t1}ms`);

		this.shapes$.value = shapes;
	}

	/**
	 * Given a list of polygons, combines them together into as few polygons as possible.
	 * @param {{ poly: Polygon; cell: [number, number] }[]} originalPolygons An array of polygons to merge
	 * @param {string} terrainTypeId The terrainTypeId value of the given polygons. Only used to populate the metadata.
	 * @param {number} height The height value of the given polygons. Only used to populate the metadata.
	 * @param {number} elevation The elevation value of the given polygons. Only used to populate the metadata.
	 * @returns {{ poly: Polygon; holes: Polygon[] }[]}
	 */
	static #combinePolygons(originalPolygons, terrainTypeId, height, elevation) {

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
			.map(p => /** @type {import("../types").HeightMapShape} */ ({
				polygon: p,
				holes: [],
				terrainTypeId,
				height,
				elevation
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
					.offset({ y: canvas.grid.h * 0.05 });

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


	// ------- //
	// History //
	// ------- //
	get canUndo() {
		return this.#history.length > 0;
	}

	/**
	 * Pushes new history data onto the stack.
	 * @param {this["#history"][number]} historyEntry
	 */
	#pushHistory(historyEntry) {
		this.#history.push(historyEntry);

		// Limit the number of changes we store in the history, removing old entries first
		while (this.#history.length > maxHistoryItems)
			this.#history.shift();
	}

	/**
	 * Undoes the most-recent change made to the height map.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async undo() {
		if (this.#history.length <= 0) return false;

		const revertChanges = this.#history.pop();
		let anyAdded = false;

		for (const revert of revertChanges) {
			const existingIndex = this.#data.findIndex(({ position }) => position[0] === revert.position[0] && position[1] === revert.position[1]);

			// If the cell was un-painted before the change, and it now is painted, remove it
			if (revert.terrainTypeId === undefined && existingIndex >= 0) {
				this.#data.splice(existingIndex, 1);
			}

			// If the cell was painted before the change, and is now painted, update it
			else if (revert.terrainTypeId !== undefined && existingIndex >= 0) {
				this.#data[existingIndex].terrainTypeId = revert.terrainTypeId;
				this.#data[existingIndex].height = revert.height;
				this.#data[existingIndex].elevation = revert.elevation;
			}

			// If the cell was painted before the change, and is now unpainted, add it
			else if (revert.terrainTypeId !== undefined && existingIndex === -1) {
				this.#data.push({ ...revert });
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
		this.#data.sort(({ position: a }, { position: b }) => a[0] - b[0] || a[1] - b[1]);
	}

	async #saveChanges() {
		// Remove any cells that do not have a valid terrain type - e.g. if the terrain type was deleted
		const availableTerrainIds = new Set(getTerrainTypes().map(t => t.id));
		this.#data = this.#data.filter(x => availableTerrainIds.has(x.terrainTypeId));

		await this.#scene.setFlag(moduleName, flags.heightData, this.#data);
	}

	/**
	 * Calculates which cells would be affected if a fill operation started at the given startCell.
	 * @param {[number, number]} startCell The cell to start the filling from.
	 */
	#findFillCells(startCell) {
		const { terrainTypeId: startTerrainTypeId, height: startHeight, elevation: startElevation } = this.get(...startCell) ?? {};

		// From the starting cell, visit all neighboring cells around it.
		// If they have the same configuration (same terrain type and height), then fill it and queue it to have this
		// process repeated for that cell.

		const visitedCells = new Set();
		const visitQueue = [startCell];

		/** @type {[number, number][]} */
		const cellsToPaint = [];

		const { width: canvasWidth, height: canvasHeight } = canvas.dimensions;

		while (visitQueue.length > 0) {
			const [nextCell] = visitQueue.splice(0, 1);

			// Don't re-visit already visited ones
			const cellKey = `${nextCell[0]}.${nextCell[1]}`;
			if (visitedCells.has(cellKey)) continue;
			visitedCells.add(cellKey);

			// Check cell is the same config
			const { terrainTypeId: nextTerrainTypeId, height: nextHeight, elevation: nextElevation } = this.get(...nextCell) ?? {};
			if (nextTerrainTypeId !== startTerrainTypeId || nextHeight !== startHeight || nextElevation !== startElevation) continue;

			cellsToPaint.push(nextCell);

			// Enqueue neighbors
			for (const neighbor of this.#getNeighboringFillCells(...nextCell)) {

				// Get the position of the cell, ignoring it if it falls off the canvas
				const [x, y] = canvas.grid.grid.getPixelsFromGridPosition(...neighbor);
				if (x + canvas.grid.w < 0) continue; // left
				if (x >= canvasWidth) continue; // right
				if (y + canvas.grid.h < 0) continue; // top
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
		if (canvas.grid.isHex)
			return canvas.grid.grid.getNeighbors(x, y);

		return [
			[x, y - 1],
			[x - 1, y],
			[x + 1, y],
			[x, y + 1]
		];
	}
}
