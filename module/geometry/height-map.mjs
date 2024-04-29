import { moduleName } from "../consts.mjs";
import { cellExists } from "../utils/array-utils.mjs";

export class HeightMap {

	/** @type {[number, number][]} */
	gridCoordinates;

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
		this.gridCoordinates = this.scene.getFlag(moduleName, "heightData") ?? [];
	}

	/**
	 * Checks if height data exists at the given position.
	 * @param {number} row
	 * @param {number} col
	 */
	has(row, col) {
		return cellExists(this.gridCoordinates, row, col);
	}

	/**
	 * Attempts to paint multiple cells at the given position.
	 * @param {[number, number][]} cells
	 * @returns `true` if the map was updated and needs to be re-drawn, `false` otherwise.
	 */
	async paintCells(cells) {
		let anyChanged = false;
		for (const cell of cells) {
			if (this.has(...cell)) continue;
			this.gridCoordinates.push(cell);
			anyChanged = true;
		}

		if (anyChanged) {
			// Sort top to bottom, left to right. Required for the polygon/hole calculation to work properly
			this.gridCoordinates.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
			await this.#saveChanges();
		}

		return anyChanged;
	}

	/**
	 * Attempts to erase data from multiple cells at the given position.
	 * @param {[number, number][]} cells
	 * @returns `true` if the map was updated and needs to be re-drawn, false otherwise.
	 */
	async eraseCells(cells) {
		let anyChanged = false;
		for (const cell of cells) {
			const idx = this.gridCoordinates.findIndex(gc => gc[0] === cell[0] && gc[1] === cell[1]);
			if (idx === -1) continue;
			this.gridCoordinates.splice(idx, 1);
			anyChanged = true;
		}

		if (anyChanged) {
			await this.#saveChanges();
		}

		return anyChanged;
	}

	async clear() {
		if (this.gridCoordinates.length === 0) return false;
		this.gridCoordinates = [];
		await this.#saveChanges();
		return true;
	}

	async #saveChanges() {
		await this.scene.setFlag(moduleName, "heightData", this.gridCoordinates);
	}
}
