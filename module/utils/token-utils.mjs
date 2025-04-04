/** @import { Point3D } from "../layers/line-of-sight-ruler-layer.mjs" */
import { LineSegment } from "../geometry/line-segment.mjs";
import { Polygon } from "../geometry/polygon.mjs";
import { getGridVerticesFromToken } from "./grid-utils.mjs";
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

	// Work out the vertices for each token
	const aVertices = a instanceof Token ? getGridVerticesFromToken(a) : [a];
	const bVertices = b instanceof Token ? getGridVerticesFromToken(b) : [b];

	// Find the midpoint of each token, and construct a ray between them
	const aCentroid = Polygon.centroid(aVertices);
	const bCentroid = Polygon.centroid(bVertices);
	const centreToCentreRay = new LineSegment(aCentroid, bCentroid);

	// For each token, find the vertex that is furtherest away from the c2c ray on either side. These will be our
	// two edge to edge rays.
	const findOuterMostPoints = (/** @type {{ x: number; y: number; }[]} */ vertices) => {
		if (vertices.length === 1) // if it was a point, not a token then just use that point as the outermost points
			return [vertices[0], vertices[0]];

		const vertexCalculations = vertices
			.map(({ x, y }) => ({ x, y, ...centreToCentreRay.findClosestPointOnLineTo(x, y) }))
			.sort((a, b) => b.distanceSquared - a.distanceSquared);
		return [vertexCalculations.find(v => v.side === 1), vertexCalculations.find(v => v.side === -1)];
	};
	const [aLeft, aRight] = findOuterMostPoints(aVertices);
	const [bLeft, bRight] = findOuterMostPoints(bVertices);

	// Work out the h value for the tokens. This is how far the token is off the ground + the token's height.
	// Note that this uses the assumption that the width and height of the token is it's h value.
	const aHeight = a instanceof Token ? a.document.elevation + getTokenHeight(a.document) * token1RelativeHeight : a.h;
	const bHeight = b instanceof Token ? b.document.elevation + getTokenHeight(b.document) * token2RelativeHeight : b.h;

	return {
		left: [
			{ x: aLeft.x, y: aLeft.y, h: aHeight },
			{ x: bLeft.x, y: bLeft.y, h: bHeight }
		],
		centre: [
			{ x: aCentroid.x, y: aCentroid.y, h: aHeight },
			{ x: bCentroid.x, y: bCentroid.y, h: bHeight }
		],
		right: [
			{ x: aRight.x, y: aRight.y, h: aHeight },
			{ x: bRight.x, y: bRight.y, h: bHeight }
		],
	};
}
