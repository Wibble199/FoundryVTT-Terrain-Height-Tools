/** @import { Point3D } from "../layers/line-of-sight-ruler-layer.mjs" */
import { LineSegment } from "../geometry/line-segment.mjs";
import { isPoint3d } from "./misc-utils.mjs";

/**
 * Gets the vertical height of a token from the given token document.
 * @param {TokenDocument} tokenDoc
 * @returns {number}
 */
export function getTokenHeight(tokenDoc) {
	// Some systems need special handling to get accurate token sizes. This logic can go here.
	switch (game.system.id) {
		// In Lancer, size 0.5 tokens still take up 1 full grid size, so the default implementation would cause them to
		// appear as size 1 instead. Instead, we can access the size property of the actor.
		case "lancer":
			return tokenDoc.actor?.system?.size ?? tokenDoc.width;

		// Be default, we just use the token's width dimension as it's vertical height.
		default:
			return tokenDoc.width;
	}
}

/**
 * Given two tokens or points, calculates the centre-to-centre ray, and the two edge-to-edge rays for them.
 * @param {Token | Point3D} a
 * @param {Token | Point3D} b
 * @param {number} token1RelativeHeight A number between 0-1 inclusive that specifies how far vertically relative to
 * token1 the ray should spawn from.
 * @param {number} token2RelativeHeight A number between 0-1 inclusive that specifies how far vertically relative to
 * token2 the ray should end at.
 * @returns {Record<"left" | "centre" | "right", [Point3D, Point3D]>}
 */
export function calculateRaysBetweenTokensOrPoints(a, b, token1RelativeHeight = 1, token2RelativeHeight = 1) {
	if (!(a instanceof Token || isPoint3d(a))) throw new Error("`token1` is not a Token or Point3D");
	if (!(b instanceof Token || isPoint3d(b))) throw new Error("`token2` is not a Token or Point3D");
	if (a === b) throw new Error("Cannot draw line of sight from a token to itself.");

	// If both a and b are points, can skip over the below calculations
	if (!(a instanceof Token) && !(b instanceof Token)) {
		return { left: [a, b], centre: [a, b], right: [a, b] };
	}

	// If the tokens are no longer present on the canvas, cannot get their position.
	if (a instanceof Token && !a.parent) return null;
	if (b instanceof Token && !b.parent) return null;

	// Find the midpoint of each token or point, and construct a ray between them
	const aCentre = a instanceof Token ? { x: a.x + (a.w / 2), y: a.y + (a.h / 2) } : a;
	const bCentre = b instanceof Token ? { x: b.x + (b.w / 2), y: b.y + (b.h / 2) } : b;
	const centreToCentreRay = new LineSegment(aCentre, bCentre);

	// Work out the points on the left and right of the token based on the C2C ray
	const [aLeft, aRight] = getLeftRightRayPoints(a, centreToCentreRay);
	const [bLeft, bRight] = getLeftRightRayPoints(b, centreToCentreRay);

	// Work out the h value for the tokens. This is how far the token is off the ground + the token's height.
	// Note that this uses the assumption that the width and height of the token is it's h value.
	const aHeight = a instanceof Token ? a.document.elevation + (getTokenHeight(a.document) * token1RelativeHeight) : a.h;
	const bHeight = b instanceof Token ? b.document.elevation + (getTokenHeight(b.document) * token2RelativeHeight) : b.h;

	return {
		left: [
			{ ...aLeft, h: aHeight },
			{ ...bLeft, h: bHeight }
		],
		centre: [
			{ ...aCentre, h: aHeight },
			{ ...bCentre, h: bHeight }
		],
		right: [
			{ ...aRight, h: aHeight },
			{ ...bRight, h: bHeight }
		]
	};
}



/**
 * Given a token or point, returns the left and right points to use when drawing line of sight from that token.
 * @param {Token | Point3D} tokenOrPoint
 * @param {LineSegment} centreToCentreRay
 * @returns {[{ x: number; y: number; }, { x: number; y: number; }]}
 */
function getLeftRightRayPoints(tokenOrPoint, centreToCentreRay) {
	// For points, the left and right origin points are just the point
	if (!(tokenOrPoint instanceof Token))
		return [tokenOrPoint, tokenOrPoint];

	// Tokens on a gridless scene that have equal width and height are shown as a circle.
	// Tokens on a gridless scene with different width and height are shown as a rectangle (these fall through to the
	// same logic that is used for square grids)
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS && tokenOrPoint.document.width === tokenOrPoint.document.height) {
		// Get the unit (normalized) length of the centre-to-centre ray, and rotate it by 90 degrees to get
		// perpendicular normalized vector.
		const px = -centreToCentreRay.uy;
		const py = centreToCentreRay.ux;

		// Center and radius of the circle of the token
		const r = tokenOrPoint.w / 2;
		const cx = tokenOrPoint.x + r;
		const cy = tokenOrPoint.y + r;

		return [
			{ x: cx - (px * r), y: cy - (py * r) },
			{ x: cx + (px * r), y: cy + (py * r) }
		];
	}

	// For hex tokens, grab the vertices from getShape().points
	if (canvas.grid.isHexagonal) {
		// We round this off in an attempt to fix the issue where small intersections are detected when using the token
		// LoS tool. This doesn't completely fix the issue, but improves it. It seems to stem from TokenDocuments' x and
		// y properties being rounded.
		return findOuterMostPoints(pointArrayToObjects(tokenOrPoint.getShape().points)
			.map(({ x, y }) => ({ x: Math.round(x + tokenOrPoint.x), y: Math.round(y + tokenOrPoint.y) })));
	}

	// For square grids, there are no points on getShape()
	const { x, y } = tokenOrPoint.document;
	const { width: w, height: h } = tokenOrPoint.getShape();

	return findOuterMostPoints([
		{ x: x, y: y },
		{ x: x + w, y: y },
		{ x: x + w, y: y + h },
		{ x: x, y: y + h }
	]);

	/** @param {{ x: number; y: number; }[]} vertices */
	function findOuterMostPoints(vertices) {
		const vertexCalculations = vertices
			.map(({ x, y }) => ({ x, y, ...centreToCentreRay.findClosestPointOnLineTo(x, y) }))
			.sort((a, b) => b.distanceSquared - a.distanceSquared);
		return [vertexCalculations.find(v => v.side === 1), vertexCalculations.find(v => v.side === -1)];
	}
}

/**
 * Takes a flat point array and converts it into an array of objects.
 * @param {number[]} arr
 * @param {number} [xOffset]
 * @param {number} [yOffset]
 * @returns {{ x: number; y: number; }[]}
 */
function pointArrayToObjects(arr, xOffset = 0, yOffset = 0) {
	const points = [];
	for (let i = 0; i < arr.length; i += 2)
		points.push({ x: arr[i] + xOffset, y: arr[i + 1] + yOffset });
	return points;
}
