import { TerrainShapeChoiceDialog } from "../applications/terrain-shape-choice-dialog.mjs";
import { flags, moduleName, tools, wallHeightModuleName } from "../consts.mjs";
import { HeightMap } from "../geometry/height-map.mjs";
import { convertConfig$, eraseConfig$, paintingConfig$ } from "../stores/drawing.mjs";
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
	 * - We also can't add listeners to the canvas.stage instance, because some part of core Foundry functionality
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

	_hoveredCell$ = new Signal({ row: -1, col: -1 }, { equalityComparer: (a, b) => a.row === b.row && a.col === b.col });

	/** @type {(() => void)[]} */
	#subscriptions = [];

	constructor() {
		super();
		Hooks.on("updateScene", this._onSceneUpdate.bind(this));
	}

	/** @return {TerrainHeightLayer | undefined} */
	static get current() {
		return canvas.terrainHeightLayer;
	}

	/** @override */
	static get layerOptions() {
		return foundry.utils.mergeObject(super.layerOptions, {
			baseClass: InteractionLayer,
			zIndex: 300
		});
	}

	get paintingConfig() {
		const { terrainTypeId, height, elevation, mode } = paintingConfig$.value;
		const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;
		return {
			selectedTerrainId: terrainTypeId,
			selectedHeight: usesHeight ? height : 0,
			selectedElevation: usesHeight ? elevation : 0,
			mode
		};
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
			canvas.interface.addChild(this._eventListenerObj);

			this._eventListenerObj.on("globalmousemove", this.#onGlobalMouseMove);

			this._graphics = new TerrainHeightGraphics();
			canvas.primary.addChild(this._graphics);

			this._highlightGraphics = new GridHighlightGraphics();
			canvas.interface.addChild(this._highlightGraphics);

			this._heightMap = new HeightMap(canvas.scene);

			await this._graphics.update(this._heightMap);

			this.#subscriptions.push(this._hoveredCell$.subscribe(({ row, col }) =>
				globalThis.terrainHeightTools.ui.terrainStackViewer._terrain$.value = this._heightMap.get(row, col)));
		}
	}

	/** @override */
	_activate() {
		// When this layer is activated (via the menu sidebar), always show the height map
		this._graphics.isLayerActive$.value = true;

		// Start mouse event listeners
		this.#setupEventListeners("on");
	}

	/** @override */
	_deactivate() {
		// When this layer is deactivated (via the menu sidebar), hide the height map unless configured to show
		this._graphics.isLayerActive$.value = false;

		// Stop mouse event listeners
		this.#setupEventListeners("off");
	}

	/** @override */
	async _tearDown(options) {
		super._tearDown(options);

		this._eventListenerObj?.off("globalmousemove", this.#onGlobalMouseMove);
		this._eventListenerObj?.parent.removeChild(this._eventListenerObj);
		this._eventListenerObj = undefined;

		this._graphics?._tearDown();
		this._graphics?.parent.removeChild(this._graphics);
		this._graphics = undefined;

		this._highlightGraphics?.parent.removeChild(this._highlightGraphics);
		this._highlightGraphics = undefined;

		this.#subscriptions.forEach(unsubscribe => unsubscribe());
		this.#subscriptions = [];
	}

	async _onSceneUpdate(scene, delta) {
		// Do nothing if the updated scene is not the one the user is looking at
		if (scene.id !== canvas.scene.id) return;

		// If only the terrain type visiblity settings have changed, just do a visibility update. Otherwise do a full
		// redraw.
		if (delta.flags?.[moduleName]?.[flags.invisibleTerrainTypes]) {
			await this._graphics?._updateShapesVisibility();
		} else {
			this._heightMap.reload();
			await this._updateGraphics();
		}
	}

	// ---- //
	// Data //
	// ---- //
	async _updateGraphics() {
		const { row, col } = this._hoveredCell$.value
		globalThis.terrainHeightTools.ui.terrainStackViewer._terrain$.value = this._heightMap.get(row, col);

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

	#onGlobalMouseMove = event => {
		const { x, y } = this.toLocal(event.data.global);
		const { i: row, j: col } = canvas.grid.getOffset({ x, y });
		this._hoveredCell$.value = { row, col };
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
				this._highlightGraphics._setColorFromTerrainTypeId(paintingConfig$.terrainTypeId$.value);
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
		/** @type {{ i: number, j: number }} */
		const { i, j } = canvas.grid.getOffset({ x, y });
		const cell = [i, j];

		switch (tool ?? this._pendingTool) {
			case tools.paint: {
				const selectedTerrainId = paintingConfig$.terrainTypeId$.value;
				if (!this.#cellIsPending(...cell) && selectedTerrainId) {
					this._pendingChanges.push(cell);
					this._highlightGraphics.highlight(...cell);
				}
				break;
			}

			case tools.pipette: {
				this._pendingTool = undefined;

				const shape = await this.#getSingleShape(...cell, {
					hint: "TERRAINHEIGHTTOOLS.SelectAShapeCopyHint",
					submitLabel: "TERRAINHEIGHTTOOLS.CopySelectedShapeConfiguration",
					submitIcon: "fas fa-eye-dropper"
				});
				if (!shape) return;

				paintingConfig$.value = {
					terrainTypeId: shape.terrainTypeId,
					height: Math.max(shape.height, 1),
					elevation: Math.max(shape.elevation, 0)
				};

				// Select the paintbrush tool. This feels like a horrible dirty way of doing this, but there doesn't
				// seem to be any API exposed by Foundry to set the tool without pretending to click the button.
				document.querySelector(`#tools-panel-${moduleName} [data-tool="${tools.paint}"]`)?.click();

				break;
			}

			case tools.erase: {
				if (!this.#cellIsPending(...cell)) {
					this._pendingChanges.push(cell);
					this._highlightGraphics.color = 0x000000;
					this._highlightGraphics.highlight(...cell);
				}
				break;
			}

			case tools.eraseShape: {
				this._pendingTool = undefined;

				const shape = await this.#getSingleShape(...cell, {
					hint: "TERRAINHEIGHTTOOLS.SelectAShapeEraseHint",
					submitLabel: "TERRAINHEIGHTTOOLS.EraseSelectedShape",
					submitIcon: "fas fa-eraser"
				});
				if (!shape) return;

				if (await this._heightMap.eraseShape(shape))
					await this._updateGraphics();
				break;
			}

			case tools.convert: {
				this._pendingTool = undefined;

				const shape = await this.#getSingleShape(...cell, {
					hint: "TERRAINHEIGHTTOOLS.SelectAShapeConvertHint",
					submitLabel: "TERRAINHEIGHTTOOLS.ConvertSelectedShape",
					submitIcon: "fas fa-arrow-turn-right"
				});
				if (!shape) return;

				await this._convertShape(shape, convertConfig$.value);

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
				const { selectedTerrainId, selectedHeight, selectedElevation, mode } = this.paintingConfig;
				if (selectedTerrainId && await this._heightMap.paintCells(pendingChanges, selectedTerrainId, selectedHeight, selectedElevation, { mode }))
					await this._updateGraphics();
				break;

			case tools.erase:
				const { excludedTerrainTypeIds: excludingTerrainTypeIds, bottom, top } = eraseConfig$.value;
				if (await this._heightMap.eraseCells(pendingChanges, { excludingTerrainTypeIds, bottom, top }))
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
	 * Returns a shape that is at the given row/col position.
	 * If there are multiple at this location, opens a dialog to ask the user which one to select.
	 * If there are none, returns `undefined`.
	 * @param {number} row
	 * @param {number} col
	 * @param {Parameters<typeof TerrainShapeChoiceDialog["show"]>[1]} [dialogOptions]
	 */
	async #getSingleShape(row, col, dialogOptions = {}) {
		const shapes = this._heightMap.getShapes(row, col);
		switch (shapes.length) {
			case 0: return undefined;
			case 1: return shapes[0];
			default: return await TerrainShapeChoiceDialog.show(shapes, dialogOptions);
		}
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
	 * @param {import("../geometry/height-map-shape.mjs").HeightMapShape} shape
	 * @param {Object} [options]
	 * @param {boolean} [options.toDrawing] Whether to convert the shape to drawings.
	 * @param {boolean} [options.toRegion] Whether to convert the shape to a new scene region.
	 * @param {boolean} [options.toWalls] Whether to convert the shape to walls.
	 * @param {boolean} [options.setWallHeightFlags] Whether to populate Wall Height module flags when converting to walls.
	 * @param {boolean} [options.deleteAfter] Whether to delete the shape after the conversion.
	 */
	async _convertShape(shape, { toDrawing = false, toRegion = false, toWalls = false, setWallHeightFlags = true, deleteAfter = false } = {}) {
		const terrainData = getTerrainType(shape.terrainTypeId);
		if (!terrainData) return;

		if (toDrawing) {
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
					text: TerrainHeightGraphics._getLabelText(shape, terrainData),
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

		if (toRegion) {
			await canvas.scene.createEmbeddedDocuments("Region", [
				{
					name: terrainData.name,
					color: Color.from(terrainData.fillColor),
					elevation: terrainData.usesHeight
						? { top: shape.top, bottom: shape.bottom }
						: { top: null, bottom: null },
					shapes: [
						{
							type: "polygon",
							hole: false,
							points: shape.polygon.vertices.flatMap(v => [v.x, v.y])
						},
						...shape.holes.map(hole => ({
							type: "polygon",
							hole: true,
							points: hole.vertices.flatMap(v => [v.x, v.y])
						}))
					],
					visibility: CONST.REGION_VISIBILITY.ALWAYS
				}
			]);
		}

		if (toWalls) {
			const flags = setWallHeightFlags && game.modules.get(wallHeightModuleName)?.active
				? { "wall-height": { top: shape.top, bottom: shape.bottom } }
				: {};

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
					sound: CONST.WALL_SENSE_TYPES.NORMAL,
					flags
				})));
		}

		if (deleteAfter) {
			await this._heightMap.eraseShape(shape);
			await this._updateGraphics();
		}
	}
}
