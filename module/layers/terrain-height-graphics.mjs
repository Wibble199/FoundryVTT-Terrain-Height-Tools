import { flags, moduleName, settings } from "../consts.mjs";
import { Edge, HeightMap, Polygon, Vertex } from "../geometry/index.mjs";
import { chunk } from '../utils/array-utils.mjs';
import { debug } from "../utils/log.mjs";
import { getTerrainTypes } from '../utils/terrain-types.mjs';

/**
 * The positions relative to the shape that the label placement algorithm will test, both horizontal and vertical.
 * Note that the order represents the order that ties are resolved, so in this case the middle will be prefered in ties.
 */
const labelPositionAnchors = [0.5, 0.4, 0.6, 0.2, 0.8];

/**
 * Specialised PIXI.Graphics instance for rendering a scene's terrain height data to the canvas.
 */
export class TerrainHeightGraphics extends PIXI.Container {

	/** @type {PIXI.Texture} */
	cursorRadiusMaskTexture;

	/** @type {PIXI.Sprite} */
	cursorRadiusMask;

	constructor() {
		super();

		/** @type {PIXI.Graphics} */
		this.graphics = new PIXI.Graphics();
		this.addChild(this.graphics);

		/** @type {PIXI.Container} */
		this.labels = new PIXI.Container();
		this.addChild(this.labels);

		this.alpha = game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer) ? 1 : 0;
		this._setMaskRadius(this.terrainHeightLayerVisibilityRadius);
		Hooks.on("highlightObjects", this.#onHighlightObjects.bind(this));
	}

	// Sorting within the PrimaryCanvasGroup works by the `elevation`, then by whether it is a token, then by whether it
	// is a Drawing, then finally by the `sort`.
	// Using an elevation of 0 puts it at the same level as tokens, tiles (except overhead tiles, which are 4), drawings
	// etc.
	// If the layer is to be drawn on top of tiles, use a very a high number (because the PCG explicitly checks for
	// DrawingShape and TokenMesh it will never be drawn over these regardless of the sort)
	// If the layer is to be drawn below tiles, use a very low number (but higher than -9999999999 which is for some other
	// sprite mesh) so that it is always below the tiles.
	get elevation() { return 0; }

	get sort() {
		/** @type {boolean} */
		const renderAboveTiles = game.canvas.scene?.getFlag(moduleName, flags.terrainLayerAboveTiles)
			?? game.settings.get(moduleName, settings.terrainLayerAboveTilesDefault);

		return renderAboveTiles ? 9999999999 : -9999999998;
	}

	/** @type {number} */
	get terrainHeightLayerVisibilityRadius() {
		return game.settings.get(moduleName, settings.terrainHeightLayerVisibilityRadius);
	}

	/**
	 * Redraws the graphics layer using the supplied height map data.
	 * @param {HeightMap} heightMap
	 */
	async update(heightMap) {
		this.graphics.clear();
		this.labels.removeChildren();
		this.parent.sortChildren();

		if (heightMap.shapes.length === 0) return;

		const terrainTypes = getTerrainTypes();

		// Load textures
		const textures = Object.fromEntries(await Promise.all(terrainTypes
			.filter(type => type.fillTexture?.length)
			.map(async type => [type.id, await loadTexture(type.fillTexture)])));

		/** @type {boolean} */
		const smartLabelPlacement = game.settings.get(moduleName, settings.smartLabelPlacement);

		for (const shape of heightMap.shapes) {
			const terrainStyle = terrainTypes.find(t => t.id === shape.terrainTypeId);
			if (!terrainStyle) continue;

			const label = terrainStyle.usesHeight
				? terrainStyle.textFormat.replace(/\%h\%/g, shape.height)
				: terrainStyle.textFormat;
			const textStyle = this.#getTextStyle(terrainStyle);

			this.#drawTerrainPolygon(shape.polygon, terrainStyle, textures);

			for (const hole of shape.holes) {
				this.graphics.beginHole();
				this.#drawTerrainPolygon(hole);
				this.graphics.endHole();
			}

			if (label?.length)
				this.#drawPolygonLabel(label, textStyle, shape, { smartPlacement: smartLabelPlacement, allowRotation: terrainStyle.textRotation });
		}
	}

	/**
	 * Draws a terrain polygon for the given (pixel) coordinates and the given terrain style.
	 * @param {Polygon} polygon
	 * @param {import("../utils/terrain-types.mjs").TerrainType | undefined} terrainStyle
	 * @param {{ [terrainTypeId: string]: PIXI.Texture } | undefined} textureMap
	 */
	#drawTerrainPolygon(polygon, terrainStyle = undefined, textureMap = undefined) {
		const color = Color.from(terrainStyle?.fillColor ?? "#000000");
		if (terrainStyle?.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && textureMap[terrainStyle.id])
			this.graphics.beginTextureFill({
				texture: textureMap[terrainStyle.id],
				color,
				alpha: terrainStyle.fillOpacity
			});
		else
			this.graphics.beginFill(color, terrainStyle?.fillOpacity ?? 0.4);

		this.graphics.lineStyle({
			width: terrainStyle?.lineWidth ?? 0,
			color: Color.from(terrainStyle?.lineColor ?? "#000000"),
			alpha: terrainStyle?.lineOpacity ?? 1,
			alignment: 0
		});

		this.graphics.moveTo(polygon.vertices[0].x, polygon.vertices[0].y);
		for (let i = 1; i < polygon.vertices.length; i++) {
			this.graphics.lineTo(polygon.vertices[i].x, polygon.vertices[i].y);
		}
		this.graphics.lineTo(polygon.vertices[0].x, polygon.vertices[0].y);
		this.graphics.closePath();

		this.graphics.endFill();
	}

	/**
	 * Draws a polygon's label at the given position.
	 * @param {string} label
	 * @param {PIXI.TextStyle} textStyle
	 * @param {import("../geometry/height-map.mjs").HeightMapShape} shape
	 * @param {Object} [options={}]
	 * @param {boolean} [options.smartPlacement=true] If true and the text does not fit at the centroid of the shape, then
	 * this function will do some additional calculations to try fit the label in at the widest point instead.
	 * @param {boolean} [options.allowRotation=false] If both this and smartPlacement are true, the placement may also
	 * rotate text to try get it to fit.
	 */
	#drawPolygonLabel(label, textStyle, shape, { smartPlacement = true, allowRotation = false } = {}) {
		// Create the text - with this we can get the width and height of the label
		const text = new PreciseText(label, textStyle);
		text.anchor.set(0.5);
		this.labels.addChild(text);

		/** Sets the position of the text label so that it's center is at the given positions. */
		const setTextPosition = (x, y, rotated) => {
			text.x = x;
			text.y = y;
			text.rotation = rotated
				? (x < game.canvas.dimensions.width / 2 ? -1 : 1) * Math.PI / 2
				: 0;
		};

		const allEdges = shape.polygon.edges.concat(shape.holes.flatMap(h => h.edges));

		/** Tests that if the text was position centrally at the given point, if it fits in the shape entirely. */
		const testTextPosition = (x, y, rotated = false) => {
			const testEdge = rotated
				? new Edge(new Vertex(x, y - text.width / 2), new Vertex(x, y + text.width / 2))
				: new Edge(new Vertex(x - text.width / 2, y), new Vertex(x + text.width / 2, y));

			return shape.polygon.containsPoint(x, y)
				&& shape.holes.every(h => !h.containsPoint(x, y))
				&& allEdges.every(e => !e.intersectsAt(testEdge));
		};

		// If the label was to be positioned at the centroid of the polygon, and it was to entirely fit there, OR smart
		// positioning is disabled, then position it at the centroid.
		if (!smartPlacement || testTextPosition(...shape.polygon.centroid, false)) {
			setTextPosition(...shape.polygon.centroid);
			return;
		}

		// If we can rotate the text, then check if rotating it 90 degrees at the centroid would allow it to fit entirely.
		if (allowRotation && testTextPosition(...shape.polygon.centroid, true)) {
			setTextPosition(...shape.polygon.centroid, true);
			return;
		}

		// If the points fall outside of the polygon, we'll pick a few rays and find the widest and place the label there.
		// On square or hex row grids, we position it to the center of the cells (hex columns have alternating Xs, so don't)
		/** @type {number[]} */
		const testPoints = [...new Set(labelPositionAnchors
			.map(y => y * shape.polygon.boundingBox.h + shape.polygon.boundingBox.y1)
			.map(y => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENR, CONST.GRID_TYPES.HEXODDR].includes(game.canvas.grid.type)
				? canvas.grid.grid.getCenter(shape.polygon.boundingBox.xMid, y)[1]
				: y))];

		let widestPoint = { y: 0, x: 0, width: -Infinity };
		for (const y of testPoints) {
			/** @type {number[]} */
			const intersections = shape.polygon.edges
				.map(e => e.intersectsYAt(y))
				.concat(shape.holes.flatMap(h => h.edges.flatMap(e => e.intersectsYAt(y))))
				.filter(Number)
				.sort((a, b) => a - b);

			for (const [x1, x2] of chunk(intersections, 2)) {
				const width = x2 - x1;
				if (width > widestPoint.width)
					widestPoint = { x: (x1 + x2) / 2, y, width };
			}
		}

		// If we are allowed to rotate the text, do the same thing but in the opposite axis.
		// Then, take whichever is wider/taller and place the label there
		if (allowRotation) {
			// On square or hex col grids, we position it to the center of the cells (hex rows have alternating Ys, so don't)
			/** @type {number[]} */
			const testPoints = [...new Set(labelPositionAnchors
				.map(x => x * shape.polygon.boundingBox.w + shape.polygon.boundingBox.x1)
				.map(x => [CONST.GRID_TYPES.SQUARE, CONST.GRID_TYPES.HEXEVENQ, CONST.GRID_TYPES.HEXODDQ].includes(game.canvas.grid.type)
					? canvas.grid.grid.getCenter(x, shape.polygon.boundingBox.yMid)[0]
					: x))];

			let tallestPoint = { y: 0, x: 0, height: -Infinity };
			for (const x of testPoints) {
				/** @type {number[]} */
				const intersections = shape.polygon.edges
					.map(e => e.intersectsXAt(x))
					.concat(shape.holes.flatMap(h => h.edges.flatMap(e => e.intersectsXAt(x))))
					.filter(Number)
					.sort((a, b) => a - b);

				for (const [y1, y2] of chunk(intersections, 2)) {
					const height = y2 - y1;
					if (height > tallestPoint.height)
						tallestPoint = { x, y: (y1 + y2) / 2, height };
				}
			}

			if (tallestPoint.height > widestPoint.width) {
				setTextPosition(tallestPoint.x, tallestPoint.y, true);
				return;
			}
		}

		setTextPosition(widestPoint.x, widestPoint.y);
	}

	/**
	 * @param {import("../utils/terrain-types.mjs").TerrainType} terrainStyle
	 * @returns {PIXI.TextStyle}
	 */
	#getTextStyle(terrainStyle) {
		const style = CONFIG.canvasTextStyle.clone();

		style.fontFamily = terrainStyle.font ?? CONFIG.defaultFontFamily;
		style.fontSize = terrainStyle.textSize;

		const color = Color.from(terrainStyle.textColor ?? 0xFFFFFF);
		style.fill = color;
		style.strokeThickness = 4;
		style.stroke = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;

		return style;
	}

	setVisible(visible) {
		return CanvasAnimation.animate([
			{
				parent: this,
				attribute: "alpha",
				to: visible ? 1 : 0
			}
		], { duration: 250 });
	}

	/**
	 * Turns on or off the mask used to only show the height around the user's cursor.
	 * @param {boolean} active
	 */
	_setMaskRadiusActive(active) {
		this._setMaskRadius(active ? this.terrainHeightLayerVisibilityRadius : 0);
	}

	/**
	 * Sets the radius of the mask used to only show the height around the user's cursor.
	 * @param {number} radius The radius of the height map mask. Use <=0 to disable.
	 */
	_setMaskRadius(radius) {
		debug(`Updating terrain height layer graphics mask size to ${radius}`);

		// Remove previous mask
		this.mask = null;
		if (this.cursorRadiusMask) this.removeChild(this.cursorRadiusMask);
		game.canvas.app.renderer.plugins.interaction.off("mousemove", this.#updateCursorMaskPosition);

		// Stop here if not applying a new mask
		if (radius <= 0) return;

		// Create a radial gradient texture
		radius *= game.canvas.grid.size;

		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = radius * 2;

		const context = canvas.getContext("2d");
		const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
		gradient.addColorStop(0.8, "rgba(255, 255, 255, 1)");
		gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

		context.fillStyle = gradient;
		context.fillRect(0, 0, radius * 2, radius * 2);

		const texture = new PIXI.Texture.from(canvas);

		// Create sprite
		this.cursorRadiusMask = new PIXI.Sprite(texture);
		this.cursorRadiusMask.anchor.set(0.5);
		this.addChild(this.cursorRadiusMask);

		// Get current mouse coordinates
		const pos = this.toLocal(game.canvas.app.renderer.plugins.interaction.mouse.global);
		this.cursorRadiusMask.position.set(pos.x, pos.y);

		// Set mask
		this.mask = this.cursorRadiusMask;
		game.canvas.app.renderer.plugins.interaction.on("mousemove", this.#updateCursorMaskPosition);
	}

	#updateCursorMaskPosition = event => {
		const pos = this.toLocal(event.data.global);
		this.cursorRadiusMask.position.set(pos.x, pos.y);
	}

	#onHighlightObjects(active) {
		// When using the "highlight objects" keybind, if the user has the radius option enabled and we're on the token
		// layer, show the entire height map
		if (game.canvas.activeLayer.name === "TokenLayer" && this.terrainHeightLayerVisibilityRadius > 0) {
			this._setMaskRadiusActive(active);
		}
	}
}
