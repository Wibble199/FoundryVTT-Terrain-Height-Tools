/** @import { ColorAnimation, ColorAnimationKeyframe } from "../color/color-animation.mjs" */
/** @import { PathCommand } from "./drawing.mjs" */
import { getColorAnimationValue, premultiplyKeyframes } from "../color/color-animation.mjs";
import { unpremultiply } from "../color/conversions.mjs";
import { LINE_TYPES } from "../consts.mjs";
import { drawComplexPath, drawDashedComplexPath } from "./drawing.mjs";

/**
 * @typedef {Object} PolygonGraphicStyle
 * @property {LINE_TYPES} lineType
 * @property {number} lineWidth
 * @property {number} lineColor
 * @property {ColorAnimation | null} [lineColorAnimation]
 * @property {number} lineOpacity
 * @property {number} lineDashSize
 * @property {number} lineGapSize
 * @property {number} [lineDashOffsetAnimation]
 * @property {number} fillType
 * @property {number} fillColor
 * @property {ColorAnimation | null} [fillColorAnimation]
 * @property {number} fillOpacity
 * @property {PIXI.Texture | null} [fillTexture]
 * @property {{ x: number; y: number; } | null} [fillTextureOffset]
 * @property {{ x: number; y: number; } | null} [fillTextureOffsetAnimation]
 * @property {{ x: number; y: number; } | null} [fillTextureScale]
 */

/**
 * A PIXI object that will render a polygon to the scene with the configured settings and animations.
 *
 * Will attempt to use the most performant rendering possible - e.g. if the fill has an animation it will use a
 * `TilingSprite` with a mask, but if the fill is not it will just use a `Graphics`.
 */
export class PolygonGraphic extends PIXI.Container {

	/** @type {PolygonGraphicStyle} */
	#style;

	/** @type {PathCommand[]} */
	#geometry;

	/** @type {PathCommand[][]} */
	#holeGeometries;

	/** @type {PIXI.Graphics | undefined} */
	#lineGraphics;

	/** @type {ColorAnimationKeyframe | undefined} */
	#lineColorAnimationKeyframesPremultiplied;

	/** @type {PIXI.Graphics | undefined} */
	#fillGraphics;

	/** @type {PIXI.TilingSprite | undefined} */
	#fillTilingSprite;

	/** @type {ColorAnimationKeyframe | undefined} */
	#fillColorAnimationKeyframesPremultiplied;

	/**
	 * @param {PolygonGraphicStyle} [style]
	 * @param {PathCommand[]} [geometry]
	 * @param {PathCommand[][]} [holeGeometries]
	 * @param {PIXI.Rectangle} [bounds]
	 */
	constructor(style, geometry, holeGeometries, bounds) {
		super();
		this.update(style, geometry, holeGeometries, bounds);
	}

	/**
	 * @param {PolygonGraphicStyle | null} style
	 * @param {PathCommand[]} geometry
	 * @param {PathCommand[][]} holeGeometries
	 * @param {PIXI.Rectangle} bounds
	 */
	update(style, geometry, holeGeometries, bounds) {
		this.#style = style;
		this.#geometry = geometry;
		this.#holeGeometries = holeGeometries;

		// Line
		const hasLine = this.#hasLine(style);
		if (hasLine) {
			if (!this.#lineGraphics) {
				this.#lineGraphics = this.addChild(new PIXI.Graphics());
				this.#lineGraphics.zIndex = 1;
			} else {
				this.#lineGraphics.clear();
			}

			this.#lineGraphics.lineStyle({
				color: 0xFFFFFF,
				alpha: 1,
				width: style.lineWidth,
				alignment: 0.5
			});

			this.#lineGraphics.tint = style.lineColor;
			this.#lineGraphics.alpha = style.lineOpacity;

			switch (style.lineType) {
				case LINE_TYPES.SOLID: {
					drawComplexPath(this.#lineGraphics, geometry);
					for (const holeGeometry of holeGeometries)
						drawComplexPath(this.#lineGraphics, holeGeometry);
					break;
				}

				case LINE_TYPES.DASHED: {
					const dashConfig = { dashSize: style.lineDashSize, gapSize: style.lineGapSize };
					drawDashedComplexPath(this.#lineGraphics, geometry, dashConfig);
					for (const holeGeometry of holeGeometries)
						drawDashedComplexPath(this.#lineGraphics, holeGeometry, dashConfig);
					break;
				}
			}

		} else if (this.#lineGraphics) {
			// Clean up graphics object if no longer needed
			this.removeChild(this.#lineGraphics);
			this.#lineGraphics.destroy();
			this.#lineGraphics = undefined;
		}

		// Fill
		//   If it has an animated texture, use a TilingSprite with a mask.
		//   Otherwise just use a Graphics.
		const hasFill = this.#hasFill(style);
		const hasOffsetAnimatedFill = this.#hasOffsetAnimatedFill(style);
		if (hasOffsetAnimatedFill) {
			const s = this.#fillTilingSprite ??= this.addChild(new PIXI.TilingSprite());
			const g = this.#fillGraphics ??= this.addChild(new PIXI.Graphics());
			s.mask = g;

			s.texture = style.fillTexture;
			s.x = bounds.x;
			s.y = bounds.y;
			s.width = bounds.width;
			s.height = bounds.height;
			s.tint = style.fillColor;
			s.alpha = style.fillOpacity;
			const { x: xScale, y: yScale } = style.fillTextureScale ?? { x: 100, y: 100 };
			s.tileScale.set(xScale / 100, yScale / 100);

			g.beginFill(0x000000, 1);
			drawComplexPath(g, geometry);
			for (const hole of holeGeometries) {
				g.beginHole();
				drawComplexPath(g, hole);
				g.endHole();
			}

		} else if (hasFill) {
			const g = this.#fillGraphics ??= this.addChild(new PIXI.Graphics());

			if (style.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && style.fillTexture) {
				const { x: xOffset, y: yOffset } = style.fillTextureOffset ?? { x: 0, y: 0 };
				const { x: xScale, y: yScale } = style.fillTextureScale ?? { x: 100, y: 100 };
				g.beginTextureFill({
					texture: style.fillTexture,
					color: 0xFFFFFF,
					alpha: 1,
					matrix: new PIXI.Matrix(xScale / 100, 0, 0, yScale / 100, xOffset, yOffset)
				});
			} else {
				g.beginFill(0xFFFFFF, 1);
			}

			g.tint = style.fillColor;
			g.alpha = style.fillOpacity;

			drawComplexPath(g, geometry);
			for (const hole of holeGeometries) {
				g.beginHole();
				drawComplexPath(g, hole);
				g.endHole();
			}
		}

		if (!hasFill && this.#fillGraphics) {
			this.removeChild(this.#fillGraphics);
			this.#fillGraphics.destroy();
			this.#fillGraphics = undefined;
		}

		if (!hasOffsetAnimatedFill && this.#fillTilingSprite) {
			this.removeChild(this.#fillTilingSprite);
			this.#fillTilingSprite.destroy();
			this.#fillTilingSprite = undefined;
		}

		// Pre-calculate the remultiplied color animation values if required
		this.#lineColorAnimationKeyframesPremultiplied = style?.lineColorAnimation
			? premultiplyKeyframes(style.lineColorAnimation.keyframes)
			: undefined;

		this.#fillColorAnimationKeyframesPremultiplied = style?.fillColorAnimation
			? premultiplyKeyframes(style.fillColorAnimation.keyframes)
			: undefined;
	}

	clear() {
		this.update(null, null, [], null);
	}

	/** Function to be called each frame to animate anything that needs animating. */
	tick() {
		const now = Date.now();

		// Line color
		if (this.#lineGraphics && this.#style.lineColorAnimation && this.#lineColorAnimationKeyframesPremultiplied) {
			const { duration, easingFunc } = this.#style.lineColorAnimation;
			const { color, alpha } = getColorAnimationValue(this.#lineColorAnimationKeyframesPremultiplied, duration, easingFunc, now);
			this.#lineGraphics.tint = unpremultiply(color, alpha);
			this.#lineGraphics.alpha = alpha;
		}

		// Line dash
		if (this.#lineGraphics && this.#style.lineType === LINE_TYPES.DASHED && (this.#style.lineDashOffsetAnimation ?? 0) !== 0) {
			this.#lineGraphics.clear();
			this.#lineGraphics.lineStyle({
				color: 0xFFFFFF,
				alpha: 1,
				width: this.#style.lineWidth,
				alignment: 0.5
			});

			const dashConfig = {
				dashSize: this.#style.lineDashSize,
				gapSize: this.#style.lineGapSize,
				offset: (now / 1000) * this.#style.lineDashOffsetAnimation
			};
			drawDashedComplexPath(this.#lineGraphics, this.#geometry, dashConfig);
			for (const holeGeometry of this.#holeGeometries)
				drawDashedComplexPath(this.#lineGraphics, holeGeometry, dashConfig);
		}

		// Fill color
		if (this.#fillGraphics && this.#style.fillColorAnimation && this.#fillColorAnimationKeyframesPremultiplied) {
			const { duration, easingFunc } = this.#style.fillColorAnimation;
			const { color, alpha } = getColorAnimationValue(this.#fillColorAnimationKeyframesPremultiplied, duration, easingFunc, now);
			const target = this.#fillTilingSprite ?? this.#fillGraphics;
			target.tint = unpremultiply(color, alpha);
			target.alpha = alpha;
		}

		// Fill texture offset
		if (this.#fillTilingSprite && this.#style.fillTextureOffsetAnimation) {
			const { x: xDelta, y: yDelta } = this.#style.fillTextureOffsetAnimation;
			const xOffset = ((now / 1000) * xDelta) % (this.#style.fillTexture?.width ?? 1);
			const yOffset = ((now / 1000) * yDelta) % (this.#style.fillTexture?.height ?? 1);
			this.#fillTilingSprite.tilePosition.set(xOffset, yOffset);
		}
	}

	/** @param {PolygonGraphicStyle | null} style */
	#hasLine(style) {
		return style
			&& style.lineType !== LINE_TYPES.NONE
			&& style.lineWidth > 0
			&& (style.lineOpacity > 0 || !!style.lineColorAnimation);
	}

	/** @param {PolygonGraphicStyle | null} style */
	#hasFill(style) {
		return style
			&& style.fillType !== CONST.DRAWING_FILL_TYPES.NONE
			&& (style.fillOpacity > 0 || !!style.fillColorAnimation);
	}

	/** @param {PolygonGraphicStyle | null} style */
	#hasOffsetAnimatedFill(style) {
		return this.#hasFill(style)
			&& style.fillType === CONST.DRAWING_FILL_TYPES.PATTERN
			&& !!style.fillTexture
			&& !!style.fillTextureOffsetAnimation
			&& style.fillTextureOffsetAnimation.x !== 0
			&& style.fillTextureOffsetAnimation.y !== 0;
	}
}
