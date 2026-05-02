/**
 * @typedef {Object} MoveCommand
 * @property {"m"} type
 * @property {number} x
 * @property {number} y
 */
/**
 * @typedef {Object} LineCommand
 * @property {"l"} type
 * @property {number} x
 * @property {number} y
 */
/**
 * @typedef {Object} ArcCommand
 * @property {"a"} type
 * @property {number} x X coordinate of the end of the arc.
 * @property {number} y Y coordinate of the end of the arc.
 * @property {number} tx X coordinate of the tangent point of the arc.
 * @property {number} ty Y coordinate of the tangent point of the arc.
 * @property {number} r Radius
 */
/**
 * @typedef {MoveCommand | LineCommand | ArcCommand} PathCommand
 */

/**
 * Draws a complex path in the given graphics object.
 * Will initially reset cursor position to (0,0), so the first command should be a move.
 * @param {PIXI.Graphics} graphics The graphics instance to draw the line to.
 * @param {Iterable<PathCommand>} commands The commands of the path to draw.
 */
export function drawComplexPath(graphics, commands) {
	graphics.moveTo(0, 0);

	for (const command of commands) {
		switch (command.type) {
			case "m":
				graphics.moveTo(command.x, command.y);
				break;

			case "l":
				graphics.lineTo(command.x, command.y);
				break;

			case "a":
				graphics.arcTo(command.tx, command.ty, command.x, command.y, command.r);
				break;

			default:
				throw new Error("Unknown command");
		}
	}
}

/**
 * Draws a complex dotted path on the given graphics object, using the line style configured on the graphics object.
 * Will initially reset cursor position to (0,0), so the first command should be a move.
 * @param {PIXI.Graphics} graphics The graphics instance to draw the line to.
 * @param {Iterable<PathCommand>} commands The commands of the path to draw.
 * @param {Object} [options={}]
 * @param {number} [options.dashSize=20] The size of the dashes.
 * @param {number} [options.gapSize=undefined] The size of the gaps between dashes (defaults to dashSize).
 * @param {number} [options.offset=0] The initial offset for the dashes.
 */
export function drawDashedComplexPath(graphics, commands, { dashSize = 20, gapSize = undefined, offset = 0 } = {}) {
	gapSize ??= dashSize;

	// Move to start position of the path
	let curX = 0, curY = 0;
	graphics.moveTo(0, 0);

	// Drawing state - whether we are drawing a dash or a gap, plus how much left there is to draw.
	// dashGapRemaining will carry on around corners to 'bend' the dash and make it look more natural.
	let dash = false;
	let dashGapRemaining = offset % (dashSize + gapSize);

	for (const command of commands) {
		switch (command.type) {
			case "m": {
				({ x: curX, y: curY } = command);
				graphics.moveTo(curX, curY);
				break;
			}

			case "l": {
				// Find the angle from the previous point to this one
				const x1 = curX, y1 = curY;
				const { x: x2, y: y2 } = command;

				const angle = Math.atan2(y2 - y1, x2 - x1);
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				const totalLength = Math.sqrt(((y2 - y1) ** 2) + ((x2 - x1) ** 2));

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
						graphics.moveTo(x1 + (cos * totalDrawn), y1 + (sin * totalDrawn));
						graphics.lineTo(x1 + (cos * (totalDrawn + distToDraw)), y1 + (sin * (totalDrawn + distToDraw)));
					}
				}

				graphics.moveTo(x2, y2); // if we end on a gap, ensure we move to where the line should end.
				curX = x2;
				curY = y2;
				break;
			}

			case "a": {
				const x1 = curX, y1 = curY;
				const { x: x2, y: y2, r } = command;

				// Calculate the center of the arc's circle
				const { x: cx, y: cy } = calculateCircleCentreFromArc(x1, y1, x2, y2, r);

				// Work out the angle of start and end positions
				const angle1 = Math.atan2(y1 - cy, x1 - cx);
				const angle2 = Math.atan2(y2 - cy, x2 - cx);

				let angle = angle1;
				let remainingAngle = (angle2 - angle1 + (Math.PI * 2)) % (Math.PI * 2);

				while (remainingAngle > Number.EPSILON) {
					if (dashGapRemaining <= 0) {
						dash = !dash;
						dashGapRemaining = dash ? dashSize : gapSize;
					}

					const dashGapAngleRemaining = dashGapRemaining / r;
					const angleToDraw = Math.min(remainingAngle, dashGapAngleRemaining);
					remainingAngle -= angleToDraw;
					dashGapRemaining -= angleToDraw * r;

					if (dash) {
						// Need to move it each time because arc draws a line from the cursor to the start point which
						// we don't want because we need to leave a gap
						graphics.moveTo((Math.cos(angle) * r) + cx, (Math.sin(angle) * r) + cy);
						graphics.arc(cx, cy, r, angle, angle + angleToDraw);
					}

					angle += angleToDraw;
				}

				graphics.moveTo(x2, y2); // if we end on a gap, ensure we move to where the line should end.
				curX = x2;
				curY = y2;
				break;
			}

			default:
				throw new Error("Unknown command");
		}
	}
}

/**
 * Given start and end points of an arc and a radius, calculates the center of the arc's circle.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} r
 */
function calculateCircleCentreFromArc(x1, y1, x2, y2, r) {
	const dx = x2 - x1, dy = y2 - y1;

	// Mid point of the chord (line between points 1 and 2)
	const chordMidX = (x1 + x2) / 2, chordMidY = (y1 + y2) / 2;

	// Length and unit X/Y of the chord
	const chordLen = Math.sqrt((dx ** 2) + (dy ** 2));
	const chordUnitX = dx / chordLen, chordUnitY = dy / chordLen;

	// Can derive the length from the mid point of the chord to the centre, and we know that vector is perpendicular to
	// the chord itself
	const chordMidToCentreLen = Math.sqrt((r ** 2) - ((chordLen / 2) ** 2));
	const chordMidToCentreUnitX = -chordUnitY, chordMidToCentreUnitY = chordUnitX;

	// Finally, work out the centre of the circle
	return {
		x: chordMidX + (chordMidToCentreLen * chordMidToCentreUnitX),
		y: chordMidY + (chordMidToCentreLen * chordMidToCentreUnitY)
	};
}
