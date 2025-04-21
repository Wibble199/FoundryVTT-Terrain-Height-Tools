/** @type {Map<string, { x: number; y: number; }>} */
const offsetCache = new Map();

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
 * Draws a line along the given (closed) path, and draws other lines inside the shape to mimic a fade out effect.
 * @param {PIXI.Graphics} graphics The graphics instance to draw the line to.
 * @param {({ x: number; y: number } | [number, number])[]} points The (x,y) points of the line to draw.
 * @param {Object} [options={}]
 * @param {number} [options.color=0] The colour of the fade.
 * @param {number} [options.alpha=1] The starting alpha of the fade.
 * @param {number} [options.distance=15] How far the fade should be drawn.
 * @param {number} [options.resolution=10] How many sub-lines make up the fade. Higher = better visual, lower = faster.
 * @param {number} [options.alignment=0] Alignment of the sub-lines.
 */
export function drawFadePath(graphics, points, { color = 0x000000, alpha = 1, distance = 15, resolution = 10, alignment = 0 } = {}) {
	// If the line wouldn't be visible, do nothing
	if (alpha === 0) return;

	// Normalise points into objects
	points = points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);

	// Work out the angles between edges at each vertex.
	const offsets = points.map((p2, i) => {
		const p1 = points[(i - 1 + points.length) % points.length];
		const p3 = points[(i + 1) % points.length];

		const angleA = Math.atan2(p2.y - p1.y, p2.x - p1.x);
		const angleB = Math.atan2(p3.y - p2.y, p3.x - p2.x);

		return getNormalisedVertexOffsetForAngle(angleA, angleB);
	});

	// Create a clone of the lineStyle where we can alter the alpha.
	// Default alpha to 1. Override width depending on the side of the fade.
	const lineStyle = { alpha, color, width: distance / resolution, alignment };
	const alphaStep = alpha / resolution;

	for (let i = 0; i < resolution; i++) {
		const d = i * distance / resolution;

		graphics.lineStyle(lineStyle);
		graphics.moveTo(points[0].x + offsets[0].x * d, points[0].y + offsets[0].y * d);
		for (let j = 1; j < points.length; j++) {
			graphics.lineTo(points[j].x + offsets[j].x * d, points[j].y + offsets[j].y * d);
		}
		graphics.lineTo(points[0].x + offsets[0].x * d, points[0].y + offsets[0].y * d);

		lineStyle.alpha -= alphaStep;
	}
}

/**
 * @param {number} angleA Angle of the first edge.
 * @param {number} angleB Angle of the second edge.
 */
function getNormalisedVertexOffsetForAngle(angleA, angleB) {
	const cacheKey = `${angleA}|${angleB}`;

	let offset = offsetCache.get(cacheKey);
	if (offset) return offset;

	// Work out the angle between the two edges
	let angleBetween = angleA - angleB + Math.PI;
	while (angleBetween < 0) angleBetween += 2 * Math.PI;
	while (angleBetween >= Math.PI * 2) angleBetween -= 2 * Math.PI;

	// Use trig to work out the distance we move along the angle between for a unit offset distance
	const trueDistance = Math.sin(Math.PI - angleBetween / 2);

	// Then, we can use that distance and angleBetween to work out the X and Y offset
	const angleMid = angleA + Math.PI - (angleBetween / 2);
	offset = {
		x: trueDistance * Math.cos(angleMid),
		y: trueDistance * Math.sin(angleMid)
	};
	offsetCache.set(cacheKey, offset);
	return offset;
}
