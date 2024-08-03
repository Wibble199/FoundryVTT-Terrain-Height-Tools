import type { Polygon } from "./geometry/polygon.mjs";

/** Represents a point in 3D space. */
export interface Point3D {
	x: number;
	y: number;
	h: number;
}

/**
 * Represents a shape that can be drawn to the map. It is a closed polygon that may have one or more holes within it.
*/
export interface HeightMapShape {
	/** The polygon that makes up the perimeter of this shape. */
	polygon: Polygon;

	/** Other additional polygons that make holes in this shape. */
	holes: Polygon[];

	terrainTypeId: string;
	height: number;
	elevation: number;
}

/** An object detailing the region of an intersection of a line of sight ray and a shape on the height map. */
interface LineOfSightIntersectionRegion {
	/** The start position of the intersection region. */
	start: Point3D;
	/** The end position of the intersection region. */
	end: Point3D;
	skimmed: boolean;
}
