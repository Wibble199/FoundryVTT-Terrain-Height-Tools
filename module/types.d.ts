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
export interface LineOfSightIntersectionRegion {
	/** The start position of the intersection region. */
	start: { x: number; y: number; h: number; t: number; };
	/** The end position of the intersection region. */
	end: { x: number; y: number; h: number; t: number; };
	skimmed: boolean;

	/** If a skim occured, which side of the test ray it occured. -1 = left, 1 = right, 0 = top skim. */
	skimSide: undefined | -1 | 0 | 1;
}

export interface FlatLineOfSightIntersectionRegion {
	/** The start position of the intersection region. */
	start: { x: number; y: number; h: number; t: number; };
	/** The end position of the intersection region. */
	end: { x: number; y: number; h: number; t: number; };
	terrainTypeId: string;
	terrainTypeIds: string[];
	height: number;
	elevation: number;
	skimmed: boolean;
}
