import { moduleName, settings, tools } from "../consts.mjs";
import { HeightMap, unpackCellKey } from "../geometry/height-map.mjs";
import { Signal } from "../utils/signal.mjs";
import { getTerrainType } from "../utils/terrain-types.mjs";
import { GridHighlightGraphics } from "./grid-highlight-graphics.mjs";
import { TerrainHeightGraphics } from "./terrain-height-graphics.mjs";

/**
 * Layer for handling interaction with the terrain height data.
 * E.G. shows overlay previews and handles click events for painting/clearing.
 */
export class TerrainHeightLayer extends InteractionLayer {

	/** @type {HeightMap | undefined} */
	_heightMap;

	/**
	 * The sole purpose of this PIXI object is to allow other THT layers listen for events that they might not ordinarily
	 * be able to, for example the masking effect for the height map vision radius:
	 * - The vision radius needs to always be able to receive the mousemove event to update the position of the mask, but
	 *   the parent object of the terrain height graphics does not always have its events turned on.
	 * - We also can't add listeners to the game.canvas.stage instance, because some part of core Foundry functionality
	 *   calls `removeAllListeners` sometimes, which then causes the event to get unbound.
	 * Having a dedicated object that THT controls that will always have events turn on seems like an easy, reliable fix.
	 * @type {PIXI.Container | undefined}
	 */
	_eventListenerObj;

	/** @type {TerrainHeightGraphics | undefined} */
	_graphics;

	/** @type {GridHighlightGraphics | undefined} */
	_highlightGraphics;

	/** @type {string | undefined} */
	_pendingTool;

	/** @type {[number, number][]} */
	_pendingChanges = [];

	/** @type {Signal<string | undefined>} */
	_selectedPaintingTerrainTypeId$ = new Signal(undefined);

	/** @type {Signal<number>} */
	_selectedPaintingHeight$ = new Signal(1);

	/** @type {Signal<number>} */
	_selectedPaintingElevation$ = new Signal(0);

	_convertConfig$ = new Signal({ toDrawings: true, toWalls: false, deleteAfter: true });

	constructor() {
		super();
		Hooks.on("updateScene", this._onSceneUpdate.bind(this));
	}

	/** @override */
	static get layerOptions() {
		return mergeObject(super.layerOptions, {
			baseClass: InteractionLayer,
			zIndex: 300
		});
	}

	get paintingConfig() {
		const selectedTerrainId = this._selectedPaintingTerrainTypeId$.value;
		const usesHeight = getTerrainType(selectedTerrainId)?.usesHeight ?? false;
		const selectedHeight = usesHeight ? this._selectedPaintingHeight$.value : 0;
		const selectedElevation = usesHeight ? this._selectedPaintingElevation$.value : 0;
		return { selectedTerrainId, selectedHeight, selectedElevation };
	}

	// -------------- //
	// Event handlers //
	// -------------- //
	/** @override */
	async _draw(options) {
		super._draw(options);

		if (this._graphics) {
			await this._updateGraphics();
		} else {
			this._eventListenerObj = new PIXI.Container();
			this._eventListenerObj.eventMode = "static";
			game.canvas.interface.addChild(this._eventListenerObj);

			this._graphics = new TerrainHeightGraphics();
			game.canvas.primary.addChild(this._graphics);

			this._highlightGraphics = new GridHighlightGraphics();
			game.canvas.interface.addChild(this._highlightGraphics);

			this._heightMap = new HeightMap(game.canvas.scene);

			await this._graphics.update(this._heightMap);
		}
	}

	/** @override */
	_activate() {
		// When this layer is activated (via the menu sidebar), always show the height map
		this._graphics.setVisible(true);
		this._graphics._setMaskRadiusActive(false);

		// Start mouse event listeners
		this.#setupEventListeners("on");
	}

	/** @override */
	_deactivate() {
		// When this layer is deactivated (via the menu sidebar), hide the height map unless configured to show
		this._graphics.setVisible(game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer));
		this._graphics._setMaskRadiusActive(true);

		// Stop mouse event listeners
		this.#setupEventListeners("off");
	}

	/** @override */
	async _tearDown(options) {
		super._tearDown(options);

		if (this._eventListenerObj) this._eventListenerObj.parent.removeChild(this._eventListenerObj);
		this._eventListenerObj = undefined;

		if (this._graphics) this._graphics.parent.removeChild(this._graphics);
		this._graphics = undefined;

		if (this._highlightGraphics) this._highlightGraphics.parent.removeChild(this._highlightGraphics);
		this._highlightGraphics = undefined;
	}

	async _onSceneUpdate(scene, data) {
		// Do nothing if the updated scene is not the one the user is looking at
		if (scene.id !== game.canvas.scene.id) return;

		this._heightMap.reload();
		await this._updateGraphics();
	}

	// ---- //
	// Data //
	// ---- //
	async _updateGraphics() {
		await this._graphics?.update(this._heightMap);
	}

	// -------------------- //
	// Mouse event handling //
	// -------------------- //
	/** @param {"on" | "off"} action */
	#setupEventListeners(action) {
		this[action]("mousedown", this.#onMouseDown);
		this[action]("mousemove", this.#onMouseMove);
		this[action]("mouseup", this.#onMouseUp);
	}

	#onMouseDown = async event => {
		if (event.button !== 0) return;
		const { x, y } = this.toLocal(event.data.global);
		await this.#beginTool(x, y);
	};

	#onMouseMove = async event => {
		if (!this._pendingTool) return;
		const { x, y } = this.toLocal(event.data.global);
		await this.#useTool(x, y);
	};

	#onMouseUp = async event => {
		if (this._pendingTool === undefined || event.button !== 0) return;
		await this.#commitPendingToolUsage();
		this._pendingTool = undefined;
	};

	/**
	 * Handles initial tool usage.
	 * @param {number} x Local X coordinate of the event trigger.
	 * @param {number} y Local Y coordinate of the event trigger.
	 * @param {string} [tool=undefined]
	 */
	async #beginTool(x, y, tool) {
		// If a tool is already in use, ignore
		if (this._pendingTool !== undefined) return;

		this._pendingTool = tool ?? game.activeTool;

		// Set highlight colours depending on the tool
		switch (this._pendingTool) {
			case tools.paint:
				this._highlightGraphics._setColorFromTerrainTypeId(this._selectedPaintingTerrainTypeId$.value);
				break;

			case tools.erase:
				this._highlightGraphics.color = 0x000000;
				break;
		}

		await this.#useTool(x, y);
	}

	/**
	 * Handles using a tool at the location. May add pending changes - e.g. if the user is clicking and dragging paint.
	 * @param {number} x Local X coordinate of the event trigger.
	 * @param {number} y Local Y coordinate of the event trigger.
	 * @param {string} [tool=undefined]
	 */
	async #useTool(x, y, tool = undefined) {
		/** @type {[number, number]} */
		const cell = game.canvas.grid.grid.getGridPositionFromPixels(x, y);

		switch (tool ?? this._pendingTool) {
			case tools.paint: {
				const existing = this._heightMap.get(...cell);
				const { selectedTerrainId, selectedHeight, selectedElevation } = this.paintingConfig;

				if (!this.#cellIsPending(...cell)
					&& (!existing || existing.terrainTypeId !== selectedTerrainId || existing.height !== selectedHeight || existing.elevation !== selectedElevation)
					&& selectedTerrainId) {
					this._pendingChanges.push(cell);
					this._highlightGraphics.highlight(...cell);
				}
				break;
			}

			case tools.fill: {
				this._pendingTool = undefined;
				const { selectedTerrainId, selectedHeight, selectedElevation } = this.paintingConfig;
				if (selectedTerrainId && await this._heightMap.fillCells(cell, selectedTerrainId, selectedHeight, selectedElevation))
					await this._updateGraphics();
				break;
			}

			case tools.pipette: {
				const cellData = this._heightMap.get(...cell);
				if (!cellData) break;

				this._selectedPaintingTerrainTypeId$.value = cellData.terrainTypeId;
				this._selectedPaintingHeight$.value = Math.max(cellData.height, 1);
				this._selectedPaintingElevation$.value = Math.max(cellData.elevation, 0);

				// Select the paintbrush tool. This feels like a horrible dirty way of doing this, but there doesn't
				// seem to be any API exposed by Foundry to set the tool without pretending to click the button.
				document.querySelector(`#tools-panel-${moduleName} [data-tool="${tools.paint}"]`)?.click();
				this._pendingTool = undefined;

				break;
			}

			case tools.erase: {
				if (!this.#cellIsPending(...cell) && this._heightMap.get(...cell)) {
					this._pendingChanges.push(cell);
					this._highlightGraphics.color = 0x000000;
					this._highlightGraphics.highlight(...cell);
				}
				break;
			}

			case tools.eraseFill: {
				this._pendingTool = undefined;
				if (await this._heightMap.eraseFillCells(cell))
					await this._updateGraphics();
				break;
			}

			case tools.convert: {
				this._pendingTool = undefined;

				const shape = this._heightMap.getShape(...cell);
				if (!shape) return;

				await this._convertShape(shape, this._convertConfig$.value);

				// Notify user, because it may not be obvious that it's worked.
				ui.notifications.info(game.i18n.localize("TERRAINHEIGHTTOOLS.NotifyShapeConversionComplete"));

				break;
			}

			default:
				return;
		}
	}

	/**
	 * Applys any pending tool usage - e.g. finishes a paint click-drag.
	 */
	async #commitPendingToolUsage() {
		// Clear pending changes and tool immediately (i.e. don't wait for the asynchronous work to complete) so that
		// repeated quick taps don't cause repeats/races
		const pendingChanges = this._pendingChanges;
		this._pendingChanges = [];

		const pendingTool = this._pendingTool;
		this._pendingTool = undefined;

		switch (pendingTool) {
			case tools.paint:
				const { selectedTerrainId, selectedHeight, selectedElevation } = this.paintingConfig;
				if (selectedTerrainId && await this._heightMap.paintCells(pendingChanges, selectedTerrainId, selectedHeight, selectedElevation))
					await this._updateGraphics();
				break;

			case tools.erase:
				if (await this._heightMap.eraseCells(pendingChanges))
					await this._updateGraphics();
				break;
		}

		this._highlightGraphics.clear();
	}

	async clear() {
		if (await this._heightMap.clear())
			await this._updateGraphics(this._heightMap);
	}

	get canUndo() {
		return this._heightMap._history.length > 0;
	}

	async undo() {
		return await this._heightMap.undo();
	}

	/**
	 * Returns whether or not the given cell is in the pending changes list.
	 * @param {number} row
	 * @param {number} col
	 */
	#cellIsPending(row, col) {
		return this._pendingChanges.some(cell => cell[0] === row && cell[1] === col);
	}

	/**
	 * Converts a shape to drawings and/or walls.
	 * @param {import("../geometry/height-map.mjs").HeightMapShape} shape
	 * @param {Object} [options]
	 * @param {boolean} [options.toDrawings] Whether to convert the shape to drawings.
	 * @param {boolean} [options.toWalls] Whether to convert the shape to walls.
	 * @param {boolean} [options.deleteAfter] Whether to delete the shape after the conversion.
	 */
	async _convertShape(shape, { toDrawings = false, toWalls = false, deleteAfter = false } = {}) {
		const terrainData = getTerrainType(shape.terrainTypeId);
		if (!terrainData) return;

		if (toDrawings) {
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
					text: TerrainHeightGraphics._getLabel(shape, terrainData),
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

		if (toWalls) {
			await canvas.scene.createEmbeddedDocuments("Wall", [...shape.polygon.edges, ...shape.holes.flatMap(h => h.edges)]
				.map(edge => ({
					c: [
						edge.p1.x,
						edge.p1.y,
						edge.p2.x,
						edge.p2.y
					],
					dir: CONST.WALL_DIRECTIONS.BOTH,
					door: CONST.WALL_DOOR_TYPES.NONE,
					light: CONST.WALL_SENSE_TYPES.NORMAL,
					move: CONST.WALL_SENSE_TYPES.NORMAL,
					sight: CONST.WALL_SENSE_TYPES.NORMAL,
					sound: CONST.WALL_SENSE_TYPES.NORMAL
				})));
		}

		if (deleteAfter) {
			await this._heightMap.eraseFillCells(unpackCellKey([...shape.cells][0]));
			await this._updateGraphics();
		}
	}
}
