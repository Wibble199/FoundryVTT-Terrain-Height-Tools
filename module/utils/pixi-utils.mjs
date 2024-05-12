/**
 * Draws a dotted path on the given graphics object, using the line style configured on the graphics object.
 * Multiple points can be given to continue the dashing (e.g. bend a dash around a corner).
 * @param {PIXI.Graphics} graphics The graphics instance to draw the line to.
 * @param {({ x: number; y: number } | [number, number])[]} points The (x,y) points of the line to draw.
 * @param {Object} [options={}]
 * @param {boolean} [options.closed=false] If true, joins the final point back up to the first to close the path.
 * @param {number} [options.dashSize=20] The size of the dashes.
 * @param {number} [options.gapSize=undefined] The size of the gaps between dashes (defaults to dashSize).
 */
export function drawDashedPath(graphics, points, { closed = false, dashSize = 20, gapSize = undefined } = {}) {
	gapSize ??= dashSize;

	// Normalise points into objects
	points = points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
	if (closed) points = [...points, points[0]];

	// Move to start position of the path
	graphics.moveTo(points[0].x, points[1].y);

	// Drawing state - whether we are drawing a dash or a gap, plus how much left there is to draw.
	// dashGapRemaining will carry on around corners to 'bend' the dash and make it look more natural.
	let dash = false;
	let dashGapRemaining = 0;

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
