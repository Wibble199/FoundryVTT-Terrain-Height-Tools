import { moduleName } from "../consts.mjs";

export class HeightMap {

	/** @type {{ position: [number, number]; terrainTypeId: string; height: number; }[]} */
	data;

	/** @param {Scene} */
	constructor(scene) {
		/** @type {Scene} */
		this.scene = scene;
		this.reload();
	}

	/**
	 * Reloads the data from the scene.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	reload() {
		this.data = this.scene.getFlag(moduleName, "heightData") ?? [];
	}

	/**
	 * Gets the height data exists at the given position, or `undefined` if it does not exist.
	 * @param {number} row
	 * @param {number} col
	 */
	get(row, col) {
		return this.data.find(({ position }) => position[0] === row && position[1] === col);
	}

	/**
	 * Attempts to paint multiple cells at the given position.
	 * @param {[number, number][]} cells A list of cells to paint.
	 * @param {string} terrainTypeId The ID of the terrain type to paint.
	 * @param {number} height The height of the terrain to paint.
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async paintCells(cells, terrainTypeId, height = 1) {
		let anyChanged = false;
		for (const cell of cells) {
			const existing = this.get(...cell);
			if (existing && existing.terrainTypeId === terrainTypeId && existing.height === height) continue;

			if (existing) {
				existing.height = height;
				existing.terrainTypeId = terrainTypeId;
			} else {
				this.data.push({ position: cell, terrainTypeId, height });
			}
			anyChanged = true;
		}

		if (anyChanged) {
			// Sort top to bottom, left to right. Required for the polygon/hole calculation to work properly
			this.data.sort(({ position: a }, { position: b }) => a[0] - b[0] || a[1] - b[1]);
			await this.#saveChanges();
		}

		return anyChanged;
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
		let anyChanged = false;
		for (const cell of cells) {
			const idx = this.data.findIndex(({ position }) => position[0] === cell[0] && position[1] === cell[1]);
			if (idx === -1) continue;
			this.data.splice(idx, 1);
			anyChanged = true;
		}

		if (anyChanged) {
			await this.#saveChanges();
		}

		return anyChanged;
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
		return true;
	}

	async #saveChanges() {
		// TODO: remove any cells that do not have a valid terrain type - e.g. if the terrain type was deleted

		await this.scene.setFlag(moduleName, "heightData", this.data);
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
