import { flags, moduleName, settings } from "../consts.mjs";
import { HeightMap, Polygon } from "../geometry/index.mjs";
import { chunk } from '../utils/array-utils.mjs';
import { debug } from "../utils/log.mjs";
import { getTerrainTypes } from '../utils/terrain-types.mjs';

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
				this.#drawPolygonLabel(label, textStyle, shape, smartLabelPlacement);
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
	 * @param {boolean} [smartPlacement=true]
	 */
	#drawPolygonLabel(label, textStyle, shape, smartPlacement = true) {
		// Create the text - with this we can get the width and height of the label
		const text = new PreciseText(label, textStyle);
		this.labels.addChild(text);

		// Get the points that are the left middle and right middle of the text, would the text be drawn at the centroid
		// of the shape's outer polygon.
		const x1 = shape.polygon.centroid[0] - text.width / 2;
		const x2 = shape.polygon.centroid[0] + text.width / 2;
		const y = shape.polygon.centroid[1];
		const x1Inside = shape.polygon.containsPoint(x1, y) && shape.holes.every(h => !h.containsPoint(x1, y));
		const x2Inside = shape.polygon.containsPoint(x2, y) && shape.holes.every(h => !h.containsPoint(x2, y));

		// If both of these fall within the polygon, then draw it there
		if ((x1Inside && x2Inside) || !smartPlacement) {
			text.x = shape.polygon.centroid[0] - text.width / 2;
			text.y = shape.polygon.centroid[1] - text.height / 2;
			return;
		}

		// If the points fall outside of the polygon, we'll pick a few rays and find the widest and place the label there
		/** @type {number[]} */
		const testPoints = [...new Set([0.2, 0.4, 0.5, 0.6, 0.8]
			.map(y => y * shape.polygon.boundingBox.h + shape.polygon.boundingBox.y1)
			.map(y => canvas.grid.grid.getCenter(shape.polygon.boundingBox.xMid, y)[1]))];

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

		text.x = widestPoint.x - text.width / 2;
		text.y = widestPoint.y - text.height / 2;
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
