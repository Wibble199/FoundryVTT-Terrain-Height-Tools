import { moduleName, settings } from "../consts.mjs";
import { HeightMap, Polygon } from "../geometry/index.mjs";
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
	// etc. Using Infinity sort places it above the tiles, however because the PCG explicitly checks for DrawingShape
	// and TokenMesh, changing the sort won't make it appear over those.
	// End result should be below drawings, tokens, overhead tiles, but above ground-level tiles.
	get elevation() { return 0; }
	get sort() { return Infinity; }

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

		if (heightMap.shapes.length === 0) return;

		const terrainTypes = getTerrainTypes();

		// Load textures
		const textures = Object.fromEntries(await Promise.all(terrainTypes
			.filter(type => type.fillTexture?.length)
			.map(async type => [type.id, await loadTexture(type.fillTexture)])));

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
					this.#drawPolygonLabel(label, textStyle, shape.centerOfMass);
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
	 * @param {[number, number]} position
	 */
	#drawPolygonLabel(label, textStyle, position) {
		const text = new PreciseText(label, textStyle);
		text.x = position[0] - text.width / 2;
		text.y = position[1] - text.height / 2;
		this.labels.addChild(text);
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
