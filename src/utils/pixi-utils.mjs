import { LineSegment } from "../geometry/line-segment.mjs";

const gradientTextureResolution = 100;
/** @type {PIXI.Texture | undefined} */
let gradientTexture;

/**
 * Draws a dotted path on the given graphics object, using the line style configured on the graphics object.
 * Multiple points can be given to continue the dashing (e.g. bend a dash around a corner).
 * @param {PIXI.Graphics} graphics The graphics instance to draw the line to.
 * @param {({ x: number; y: number } | [number, number])[]} points The (x,y) points of the line to draw.
 * @param {Object} [options={}]
 * @param {boolean} [options.closed=false] If true, joins the final point back up to the first to close the path.
 * @param {number} [options.dashSize=20] The size of the dashes.
 * @param {number} [options.gapSize=undefined] The size of the gaps between dashes (defaults to dashSize).
 * @param {number} [options.offset=0] The initial offset for the dashes.
 */
export function drawDashedPath(graphics, points, { closed = false, dashSize = 20, gapSize = undefined, offset = 0 } = {}) {
	gapSize ??= dashSize;

	// Normalise points into objects
	points = points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
	if (closed) points = [...points, points[0]];

	// Move to start position of the path
	graphics.moveTo(points[0].x, points[1].y);

	// Drawing state - whether we are drawing a dash or a gap, plus how much left there is to draw.
	// dashGapRemaining will carry on around corners to 'bend' the dash and make it look more natural.
	let dash = false;
	let dashGapRemaining = offset;

	// For each subsequent point, find the angle from the previous point to this one
	for (let i = 1; i < points.length; i++) {
		const { x: x1, y: y1 } = points[i - 1];
		const { x: x2, y: y2 } = points[i];
		const angle = Math.atan2(y2 - y1, x2 - x1);
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const totalLength = Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));

		let remainingLength = totalLength;

		while (remainingLength > Number.EPSILON) {

			if (dashGapRemaining <= 0) {
				dash = !dash;
				dashGapRemaining = dash ? dashSize : gapSize;
			}

			const totalDrawn = totalLength - remainingLength;
			const distToDraw = Math.min(remainingLength, dashGapRemaining);
			remainingLength -= distToDraw;
			dashGapRemaining -= distToDraw;

			if (dash) {
				graphics.moveTo(x1 + cos * totalDrawn, y1 + sin * totalDrawn);
				graphics.lineTo(x1 + cos * (totalDrawn + distToDraw), y1 + sin * (totalDrawn + distToDraw));
			}
		}
	}
}

/**
 * Draws gradient fills along the inside of the given polygon to mimic an inner fade out effect.
 * @param {PIXI.Graphics} graphics The graphics instance to draw the polygon to.
 * @param {({ x: number; y: number } | [number, number])[]} points The (x,y) points of the polygon to draw.
 * @param {Object} [options={}]
 * @param {number} [options.color=0] The colour of the fade.
 * @param {number} [options.alpha=1] The starting alpha of the fade.
 * @param {number} [options.distance=15] How far the fade should be drawn.
 */
export function drawInnerFade(graphics, points, { color = 0x000000, alpha = 1, distance = 15 } = {}) {
	// If the line wouldn't be visible, do nothing
	if (alpha === 0 || distance <= 0) return;

	// Normalise points into objects
	const pointsN = points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);

	// Work out the edges of the inner polygon
	const innerEdges = pointsN.map((p1, idx) => {
		const p2 = pointsN[(idx + 1) % pointsN.length];
		const innerEdge = new LineSegment(p1, p2).translatePerpendicular(distance);
		return { p1, p2, innerEdge };
	});

	const texture = getGradientTexture(color, alpha);

	// Work out the inner sub-polygons and draw them with a fill
	for (let i = 0; i < innerEdges.length; i++) {
		// p1 and p2 are just the points as defined on the outer polygon itself
		const { p1, p2, innerEdge: thisEdge } = innerEdges[i];
		const prevEdge = innerEdges[(i + innerEdges.length - 1) % innerEdges.length].innerEdge;
		const nextEdge = innerEdges[(i + 1) % innerEdges.length].innerEdge;

		// p3 and p4 are derived from their neighbors' inner edges to prevent overlap or gaps
		const p3 = thisEdge.isParallelTo(nextEdge) ? thisEdge.p2 : thisEdge.intersectsAt(nextEdge, { ignoreLength: true });
		const p4 = thisEdge.isParallelTo(prevEdge) ? thisEdge.p1 : thisEdge.intersectsAt(prevEdge, { ignoreLength: true });

		// Draw
		const matrix = new PIXI.Matrix()
			.scale(distance / gradientTextureResolution, 1)
			.rotate(thisEdge.angle + Math.PI / 2)
			.translate(p1.x, p1.y);

		graphics.beginTextureFill({ texture, matrix, color, alpha });
		graphics.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).lineTo(p3.x, p3.y).lineTo(p4.x, p4.y);
		graphics.endFill();
	}
}

/**
 * Gets or creates a gradient texture.
 * @returns {PIXI.Texture}
 */
function getGradientTexture() {
	if (gradientTexture) return gradientTexture;

	// Add a 10% buffer to help prevent a thin darker line from appearing on the inside at certain zoom levels
	const textureBuffer = 1.1;

	// https://pixijs.com/7.x/examples/textures/gradient-basic
	// Create a canvas and render a texture graphic
	const canvas = document.createElement("canvas");
	canvas.width = gradientTextureResolution * textureBuffer;
	canvas.height = 1;

	const canvasContext = canvas.getContext("2d");

	const gradient = canvasContext.createLinearGradient(0, 0, gradientTextureResolution * textureBuffer, 0);
	gradient.addColorStop(0, `rgba(255, 255, 255, 1)`);
	gradient.addColorStop(1 / textureBuffer, `rgba(255, 255, 255, 0)`);

	canvasContext.fillStyle = gradient;
	canvasContext.fillRect(0, 0, gradientTextureResolution * textureBuffer, 1);

	gradientTexture = PIXI.Texture.from(canvas);
	return gradientTexture;
}
