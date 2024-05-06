import { moduleName, settings } from "../consts.mjs";

const maxHistoryItems = 10;

export class HeightMap {

	/** @type {{ position: [number, number]; terrainTypeId: string; height: number; }[]} */
	data;

	/** @type {{ position: [number, number]; terrainTypeId: string | undefined; height: number | undefined; }[][]} */
	_history = [];

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
		return true;
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
		/** @type {Set<string>} */
		const availableTerrainIds = new Set(game.settings.get(moduleName, settings.terrainTypes).map(t => t.id));
		this.data = this.data.filter(x => availableTerrainIds.has(x.terrainTypeId));

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
