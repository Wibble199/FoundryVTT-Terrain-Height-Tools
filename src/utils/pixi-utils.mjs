/**
 * Creates a new Pixi Rectangle from two points (instead of a point and a width and height).
 * @param {{ x: number; y: number; }} p1
 * @param {{ x: number; y: number; }} p2
 */
export function rectangleFromP1P2(p1, p2) {
	const minX = Math.min(p1.x, p2.x);
	const maxX = Math.max(p1.x, p2.x);
	const minY = Math.min(p1.y, p2.y);
	const maxY = Math.max(p1.y, p2.y);
	return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
}
