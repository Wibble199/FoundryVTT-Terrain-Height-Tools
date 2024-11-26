# Terrain Height Tools API

> [!NOTE]
> This page is only relevant to macro, script or module developers that want to integrate with Terrain Height Tools.

Terrain Height Tools exposes an API that can be used by macros, scripts or, other modules. This is available through the
global `terrainHeightTools` property. The following functions are available.

Types:
- [`T:Point3D`](#tpoint3d)

Functions:
- [`calculateLineOfSight`](#calculatelineofsight)
- [`calculateLineOfSightByShape`](#calculatelineofsightbyshape)
- [`calculateLineOfSightRaysBetweenTokens`](#calculatelineofsightraysbetweentokens)
- [`clearLineOfSightRays`](#clearlineofsightrays)
- [`drawLineOfSightRay`](#drawlineofsightray)
- [`drawLineOfSightRays`](#drawlineofsightrays)
- [`drawLineOfSightRaysBetweenTokens`](#drawlineofsightraysbetweentokens)
- [`eraseCells`](#erasecells)
- [`getCell`](#getcell)
- [~~`getShape`~~](#getshape)
- [`getShapes`](#getshapes)
- [`getTerrainType`](#getterraintype)
- [`getTerrainTypes`](#getterraintypes)
- [`paintCells`](#paintcells)

## T:Point3D

Represents a point in 3D space.

### Properties

|Name|Type|Description|
|-|-|-|
|`x`|`number`|Position in the X axis measured in canvas pixels.|
|`y`|`number`|Position in the Y axis measured in canvas pixels.|
|`h`|`number`|Height position, measured in arbitrary height values, just as the terrains' heights are.|

## calculateLineOfSight

![Available Since v0.3.0](https://img.shields.io/badge/Available%20Since-v0.3.0-blue?style=flat-square)
![Changed in v0.4.0](https://img.shields.io/badge/Changed%20In-v0.4.0-orange?style=flat-square)

Computes a line sight test between two points in 3d space.

Note that this will always return an empty array if the line of sight ray is zero-length, even if the start/end point is within a shape.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`p1`|`Point3D`|*Required*|The initial point that the LOS ray should begin from. The `x` and `y` coordinates are measured in pixels relative to the canvas. `h` is measured in an arbitrary unit, just as the terrains' heights are.|
|`p2`|`Point3D`|*Required*|The point that the LOS ray should end. The `x` and `y` coordinates are measured in pixels relative to the canvas. `h` is measured in an arbitrary unit, just as the terrains' heights are.|
|`options`|`Object`|`{}`|Additional options for configuring the calculation.|
|`options.includeNoHeightTerrain`|`boolean`|`false`|If false, any terrain types that are configured as not using a height are excluded from the calculation. If true, these terrains are included, and their height is treated as if it were infinity.|

### Returns

An combined array of distinct regions where a ray drawn from `p1` to `p2` intersects or touches any terrain shapes.
- All regions will have a non-zero length.
- The regions will not overlap.
- There may be gaps _between_ regions if the line of sight ray does not intersect any terrain shape at this position.
- The regions in the array are sorted in order they are encountered along the line of sight ray.
- Each region object has the following properties:

|Name|Type|Description|
|-|-|-|
|`start`|`Object`|An object detailing the start of the region.|
|`start.x`|`number`|The X coordinate (in canvas pixels) where the intersection started.|
|`start.y`|`number`|The Y coordinate (in canvas pixels) where the intersection started.|
|`start.h`|`number`|The height where the intersection started.|
|`start.t`|`number`|How far along the line of sight ray the intersection started. Will always be a value between 0 and 1 inclusive. E.G. on a ray that is 100px long, a `t` value of 0.2 would mean that it started 20 pixels along the ray.|
|`end`|`Object`|An object detailing the end of the region.|
|`end.x`|`number`|The X coordinate (in canvas pixels) where the intersection ended.|
|`end.y`|`number`|The Y coordinate (in canvas pixels) where the intersection ended.|
|`end.h`|`number`|The height where the intersection ended.|
|`end.t`|`number`|How far along the line of sight ray the intersection ended. Will always be a value between 0 and 1 inclusive. E.G. on a ray that is 200px long, a `t` value of 0.3 would mean that it ended 60 pixels along the ray.|
|`shapes`|`HeightMapShape[]`|An array of the shape(s) that were intersected at this region.|
|`skimmed`|`boolean`|If `true`, this region is an area where the line of sight ray touches but does not completely enter the shape. This will also be the case if the line of sight ray is flat and the shape is the height of the ray. For example a ray where p1.h = 1 and p2.h = 2 intersecting a height 1 object will always result in a skim. If `false`, the ray has completely entered the shape.|

### Examples

```js
// Run the calculation
const result = terrainHeightTools.calculateLineOfSight({ x: 200, y: 100, h: 1 }, { x: 300, y: 400, h: 2 });

// Example: Check to see if there are any intersections?
const anyIntersections = result.length > 0;

// Example: Check to see if there are any intersections, excluding skimming ones:
const anyIntersectionsNoSkimming = result.some(r => !r.skimmed);

// Example: Check to see if it has intersected with a specific type of terrain.
const hardCoverTerrainType = terrainHeightTools.getTerrainType({ name: "Hard Cover" });
const hasIntersectedWithHardCover = result.some(r => r.shapes.some(s => s.terrainTypeId === hardCoverTerrainType.id));
```

## calculateLineOfSightByShape

![Available Since v0.3.0](https://img.shields.io/badge/Available%20Since-v0.3.0-blue?style=flat-square)

A more verbose version of `calculateLineOfSight`. Takes the same parameters but returns the intersections grouped by the shape that it occured on.

Regions are not merged with other shapes' regions, so in a case where two different shapes are touching and the line of sight ray skims between the two, this function will be able to detail both, whereas `calculateLineOfSight` would only show one.

In most cases, `calculateLineOfSight` is an easier function to use.

Note that this will always return an empty array if the line of sight ray is zero-length, even if the start/end point is within a shape.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`p1`|`Point3D`|*Required*|The initial point that the LOS ray should begin from. The `x` and `y` coordinates are measured in pixels relative to the canvas. `h` is measured in an arbitrary unit, just as the terrains' heights are.|
|`p2`|`Point3D`|*Required*|The point that the LOS ray should end. The `x` and `y` coordinates are measured in pixels relative to the canvas. `h` is measured in an arbitrary unit, just as the terrains' heights are.|
|`options`|`Object`|`{}`|Additional options for configuring the calculation.|
|`options.includeNoHeightTerrain`|`boolean`|`false`|If false, any terrain types that are configured as not using a height are excluded from the calculation. If true, these terrains are included, and their height is treated as if it were infinity.|

### Returns

An array of all shapes that were intersected by a ray drawn from `p1` to `p2`, along with the intersection regions for that shape.

|Name|Type|Description|
|-|-|-|
|`shape`|`Object`|An object containing details about the intersected shape.|
|`shape.height`|`number`|The height of the shape painted to the scene.|
|`shape.elevation`|`number`|The elevation of the shape painted to the scene.|
|`shape.terrainTypeId`|`string`|The terrain type ID of the shape that was intersected.|
|`region`|`Array`|An array of intersection regions with this shape. See below.|

The `regions` array is an array of objects.
- All regions will have a non-zero length.
- The regions will not overlap.
- There may be gaps _between_ regions if the line of sight ray does not intersect the terrain shape at this position.
- The regions in the array are sorted in order they are encountered along the line of sight ray.
- Each region object has the following properties:

|Name|Type|Description|
|-|-|-|
|`start`|`Object`|An object detailing the start of the region.|
|`start.x`|`number`|The X coordinate (in canvas pixels) where the intersection started.|
|`start.y`|`number`|The Y coordinate (in canvas pixels) where the intersection started.|
|`start.h`|`number`|The height where the intersection started.|
|`start.t`|`number`|How far along the line of sight ray the intersection started. Will always be a value between 0 and 1 inclusive. E.G. on a ray that is 100px long, a `t` value of 0.2 would mean that it started 20 pixels along the ray.|
|`end`|`Object`|An object detailing the end of the region.|
|`end.x`|`number`|The X coordinate (in canvas pixels) where the intersection ended.|
|`end.y`|`number`|The Y coordinate (in canvas pixels) where the intersection ended.|
|`end.h`|`number`|The height where the intersection ended.|
|`end.t`|`number`|How far along the line of sight ray the intersection ended. Will always be a value between 0 and 1 inclusive. E.G. on a ray that is 200px long, a `t` value of 0.3 would mean that it ended 60 pixels along the ray.|
|`skimmed`|`boolean`|If `true`, this region is an area where the line of sight ray touches but does not completely enter the shape. This will also be the case if the line of sight ray is flat and the shape is the height of the ray. For example a ray where p1.h = 1 and p2.h = 2 intersecting a height 1 object will always result in a skim. If `false`, the ray has completely entered the shape.|

## calculateLineOfSightRaysBetweenTokens

![Available Since v0.3.3](https://img.shields.io/badge/Available%20Since-v0.3.3-blue?style=flat-square)

Calculates the pairs of points to calculate line of sight rays between two tokens. These can then be used with other
functions such as [calculateLineOfSight](#calculatelineofsight).

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`token1`|`Token`|*Required*|The first token (to calculate the points from).|
|`token2`|`Token`|*Required*|The second token (to calculate the points to).|
|`options`|`Object`|`{}`|Additional options for configuring the points.|
|`options.token1RelativeHeight`|`number \| undefined`|`undefined`|How far the rays end vertically, relative to the height of `token1`. For example: a value of 0 would start the ray at the bottom of the token (h = token's elevation); 1 would start the ray at the top of the token (h = token's elevation + token's size); 0.5 would start the ray half way up the token (h = token's elevation + 0.5 * token's size). If undefined, then this defaults to whatever the value has been configued to at the world-scope by the GM.|
|`options.token2RelativeHeight`|`number \| undefined`|`undefined`|How far the rays end vertically, relative to the height of `token2`. For example: a value of 0 would end the ray at the bottom of the token (h = token's elevation); 1 would end the ray at the top of the token (h = token's elevation + token's size); 0.5 would end the ray half way up the token (h = token's elevation + 0.5 * token's size). If undefined, then this defaults to whatever the value has been configued to at the world-scope by the GM.|

### Returns

An object containing 3 properties: `left`, `centre` and `right`. `left` and `right` are relative to the lines between token1 and token2. In other words: imagine yourself standing at the centre of token1 and looking at the centre of token 2. The `left` ray would be on your left and the `right` ray would be on your right.

|Name|Type|Description|
|-|-|-|
|`left`|`{ p1: Point3D; p2: Point3D; }`|The start and end points of a ray between the left-most point of `token1` and the left-most point of `token2`.|
|`centre`|`{ p1: Point3D; p2: Point3D; }`|The start and end points of a ray between the centre of `token1` and the centre of `token2`.|
|`right`|`{ p1: Point3D; p2: Point3D; }`|The start and end points of a ray between the right-most point of `token1` and the right-most point of `token2`.|

### Examples

```js
// Eample: Fetch the user's controlled token and the one that they are targetting and calculate the rays between them.
// (Note that you should add checks to ensure these tokens are defined, but for brevity that is not done here)
const controlledToken = canvas.tokens.controlled[0];
const targetedToken = game.user.targets.first();
const { left, centre, right } = terrainHeightTools.calculateLineOfSightRaysBetweenTokens(controlledToken, targetedToken, {
	token1RelativeHeight: 0,
	token2RelativeHeight: 1
});

// Example: draw the lines of sight between these two tokens
// (Note: can also use drawLineOfSightRaysBetweenTokens to achieve this same effect)
terrainHeightTools.drawLineOfSightRays([
	{ p1: left.p1, p2: left.p2, showLabels: false },
	{ p1: centre.p1, p2: centre.p2, showLabels: true },
	{ p1: right.p1, p2: right.p2, showLabels: false },
]);

// Example: Test if all lines of sight are broken by 'Hard Cover' terrain.
const hardCoverId = terrainHeightTools.getTerrainType({ name: "Hard Cover" }).id;
const isBlockedByHardCover = [left, centre, right].every(ray =>
	terrainHeightTools.calculateLineOfSight(ray.p1, ray.p2).some(region =>
		region.terrainTypeId === hardCoverId));

// Example: draw the lines of sight between these two tokens, but drawing the line of sight at ground level regardless of token size and elevation
terrainHeightTools.drawLineOfSightRays([
	{ p1: { ...left.p1, h: 0 }, p2: { ...left.p2, h: 0 }, showLabels: false },
	{ p1: { ...centre.p1, h: 0 }, p2: { ...centre.p2, h: 0 }, showLabels: true },
	{ p1: { ...right.p1, h: 0 }, p2: { ...right.p2, h: 0 }, showLabels: false },
]);
```

## clearLineOfSightRays

![Available Since v0.3.3](https://img.shields.io/badge/Available%20Since-v0.3.3-blue?style=flat-square)

Clears line of sight rays drawn by the current user.

Takes no parameters and has no return value.

## drawLineOfSightRay

![Available Since v0.3.3](https://img.shields.io/badge/Available%20Since-v0.3.3-blue?style=flat-square)

Draws a single line of sight ray between the given points.

Note that calling this function will clear any previously drawn line of sight ruler, including those drawn using the tools in the toolbox, except those drawn by other players. If you need to draw multiple lines simultaneously, use [`drawLineOfSightRays`](#drawlineofsightrays).

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`p1`|`Point3D`|*Required*|The start position of the ray to draw.|
|`p2`|`Point3D`|*Required*|The end position of the ray to draw.|
|`options`|`Object`|`{}`|Additional options for configuring how the ray is drawn.|
|`options.drawForOthers`|`boolean`|`true`|Whether the ray will be drawn for other connected users on the same scene.|
|`options.includeNoHeightTerrain`|`boolean`|`false`|If false, any terrain types that are configured as not using a height are excluded from the calculation. If true, these terrains are included, and their height is treated as if it were infinity.|
|`options.showLabels`|`boolean`|`true`|Whether or not to show the "H" labels at either end of the ruler.|

### Example
```js
// Example: draw a line of sight between two points
terrainHeightTools.drawLineOfSightRay(
	{ x: 1000, y: 1000, h: 1 },
	{ x: 1500, y: 1500, h: 0.5 },
	{ includeNoHeightTerrain: true, showLabels: false }
);
```

## drawLineOfSightRays

![Available Since v0.3.3](https://img.shields.io/badge/Available%20Since-v0.3.3-blue?style=flat-square)

Draws any number of line of sight rays between pairs of points.

Note that calling this function will clear any previously drawn line of sight ruler, including those drawn using the tools in the toolbox, except those drawn by other players.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`rays`|`{ p1: Point3D; p2: Point3D; includeNoHeightTerrain?: boolean; showLabels?: boolean; }[]`|*Required*|An array of lines to draw. Each element in this array MUST have a `p1` and `p2`. All other properties are optional and have the same defaults as their respective option in [`drawLineOfSightRay`](#drawlineofsightray)|
|`options`|`Object`|`{}`|Additional options for configuring how the ray is drawn.|
|`options.drawForOthers`|`boolean`|`true`|Whether the ray will be drawn for other connected users on the same scene.|

### Example
```js
// Example: Drawing three line of sight rulers between some arbitrary points
terrainHeightTools.drawLineOfSightRays([
	{ p1: { x: 100, y: 90, h: 0 }, p2: { x: 0, y: 80, h: 0 }, includeNoHeightTerrain: true },
	{ p1: { x: 200, y: 200, h: 1 }, p2: { x: 200, y: 500, h: 1 }, showLabels: false },
	{ p1: { x: 123, y: 456, h: 3 }, p2: { x: 456, y: 123, h: 5 } },
], { drawForOthers: true });
```

## drawLineOfSightRaysBetweenTokens

![Available Since v0.3.3](https://img.shields.io/badge/Available%20Since-v0.3.3-blue?style=flat-square)

Calculates and draws line of sight rays between the given two tokens, as per the _Token Line of Sight_ tool.

Note that calling this function will clear any previously drawn line of sight ruler, including those drawn using the tools in the toolbox, except those drawn by other players.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`token1`|`Token`|*Required*|The first token to draw line of sight from.|
|`token2`|`Token`|*Required*|The second token to draw line of sight to.|
|`options`|`Object`|`{}`|Additional options to configure how the line is drawn.|
|`options.token1RelativeHeight`|`number \| undefined`|`undefined`|How far the rays end vertically, relative to the height of `token1`. For example: a value of 0 would start the ray at the bottom of the token (h = token's elevation); 1 would start the ray at the top of the token (h = token's elevation + token's size); 0.5 would start the ray half way up the token (h = token's elevation + 0.5 * token's size). If undefined, then this defaults to whatever the value has been configued to at the world-scope by the GM.|
|`options.token2RelativeHeight`|`number \| undefined`|`undefined`|How far the rays end vertically, relative to the height of `token2`. For example: a value of 0 would end the ray at the bottom of the token (h = token's elevation); 1 would end the ray at the top of the token (h = token's elevation + token's size); 0.5 would end the ray half way up the token (h = token's elevation + 0.5 * token's size). If undefined, then this defaults to whatever the value has been configued to at the world-scope by the GM.|
|`options.includeNoHeightTerrain`|`boolean`|`false`|If false, any terrain types that are configured as not using a height are excluded from the calculation. If true, these terrains are included, and their height is treated as if it were infinity.|
|`options.drawForOthers`|`boolean`|`true`|Whether the ray will be drawn for other connected users on the same scene.|

### Example
```js
// Example: draw line of sight between the selected and targeted tokens
// (Note that you should add checks to ensure these tokens are defined, but for brevity that is not done here)
const controlledToken = canvas.tokens.controlled[0];
const targetedToken = game.user.targets.first();
terrainHeightTools.drawLineOfSightRaysBetweenTokens(controlledToken, targetedToken, {
	token1RelativeHeight: 0.5,
	includeNoHeightTerrain: true
});
```

## eraseCells

![Available Since v0.1.4](https://img.shields.io/badge/Available%20Since-v0.1.4-blue?style=flat-square)

Erases terrain data from the given cells.

Users must have permissions to update the scene to use this.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`cells`|`[number, number][]`|*Required*|An array of cells to erase terrain data from. Each element in the array should be a pair of numbers representing the X and Y coordinates of a cell. Note that these are grid coordinates, not pixel coordinates. The cells do not have to be adjacent.|

### Returns

A `Promise<boolean>` that will resolve when the data has been saved to the scene. The boolean that is returned will indicate whether or not any changes were made to the terrain map.

### Example
```js
await terrainHeightTools.eraseCells([
	[12, 14],
	[23, 12]
]);
```

## getCell

![Available Since v0.3.0](https://img.shields.io/badge/Available%20Since-v0.3.0-blue?style=flat-square)
![Changed in v0.4.0](https://img.shields.io/badge/Changed%20In-v0.4.0-orange?style=flat-square)

Fetches the terrain data from a specific cell.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`x`|`number`|*Required*|The X coordinate of the cell to read. This is in grid coordinates, not pixel coordinates.|
|`y`|`number`|*Required*|The Y coordinate of the cell to read. This is in grid coordinates, not pixel coordinates.|

### Returns

An array of terrain in the given cell. Each element in the array is an object with the following properties.

|Name|Type|Description|
|-|-|-|
|`terrainTypeId`|`string`|The ID of the terrain type in this cell.|
|`height`|`number`|The height of the terrain in this cell.|
|`elevation`|`number`|The elevation of the terrain in this cell.|

### Example
```js
const cell = terrainHeightTools.getCell(2, 3);

if (cell.length === 0) {
	console.log("This cell is unpainted.");
} else {
	for (const { terrainTypeId, height } of cell) {
		const terrainType = terrainHeightTools.getTerrainType({ id: terrainTypeId });
		console.log(`${terrainType.name} is painted in this cell, at a height of ${height}.`);
	}
}
```

## ~~getShape~~

![Removed in v0.4.0](https://img.shields.io/badge/Removed%20In-v0.4.0-red?style=flat-square)

This function has been replaced by [`getShapes`](#getshapes).

## getShapes

![Available Since v0.4.0](https://img.shields.io/badge/Available%20Since-v0.4.0-blue?style=flat-square)

Fetches the height map shapes that exist at a specific cell.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`x`|`number`|*Required*|The X coordinate of the cell to read. This is in grid coordinates, not pixel coordinates.|
|`y`|`number`|*Required*|The Y coordinate of the cell to read. This is in grid coordinates, not pixel coordinates.|

### Returns

Either any array containing 0 or more `HeightMapShape`s. Each shape represents one region of terrain that exists at that
cell. The order of the terrain is not guaranteed.

Each `HeightMapShape` has the following properties:

|Name|Type|Description|
|-|-|-|
|`polygon`|`Polygon`|The polygon that defines the outer perimeter of this shape.|
|`holes`|`Polygon[]`|An array of polygons that define holes within this shape.|
|`terrainTypeId`|`string`|The ID of the terrain type in this cell.|
|`height`|`number`|The height of the terrain in this cell.|
|`elevation`|`number`|The elevation of the terrain in this cell.|

### Example
```js
const shapes = terrainHeightTools.getShapes(2, 3);

if (shapes.length === 0) {
	console.log("This cell is unpainted.");
} else {
	for (const shape of shapes) {
		const terrainType = terrainHeightTools.getTerrainType({ id: shape.terrainTypeId });
		console.group(`The edges of this ${terrainType.name} shape are:`);
		for (const edge of shape.polygon.edges)
			console.log(edge.toString());
		console.groupEnd();
	}
}
```

## getTerrainType

![Available Since v0.3.0](https://img.shields.io/badge/Available%20Since-v0.3.0-blue?style=flat-square)

Attempts to find a specific terrain type by its name or its ID.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`terrain`|`Object`|*Required*|The terrain to search for. Either `id` or `name` must be provided.|
|`terrain.id`|`string`|`undefined`|If provided, will attempt to find a terrain type with this ID.|
|`terrain.name`|`string`|`undefined`|If provided, will attempt to find a terrain type with this name. Note that this is case-sensitive. If multiple terrain types have the same name, the first will be returned.|

### Returns

If a terrain type with the given name or ID was not found, then `undefined`.
If it was found, an object with the following properties:

|Name|Type|Description|
|-|-|-|
|`id`|`string`|A unique ID for this terrain type.|
|`name`|`string`|The name of this terrain type, as shown in the palette.|
|`usesHeight`|`boolean`|Whether or not the terrain type has a height value.|
|`isSolid`|`boolean`|Whether or not the terrain type is considered solid for the purposes of automatically adjusting token height (since v0.3.6).|
|`fillType`|`number`|The fill type used by the terrain type: 0 = none; 1 = solid; 2 = texture.|
|`fillColor`|`string`|A hex string for the fill color.|
|`fillOpacity`|`number`|The opacity of the fill. 0 = transparent, 1 = opaque.|
|`fillTexture`|`string`|The path to a texture to use when using texture fill mode.|
|`lineType`|`number`|The fill type used by the terrain type: 0 = none; 1 = solid; 2 = dashed.|
|`lineColor`|`string`|A hex string for the line color.|
|`lineOpacity`|`number`|The opacity of the line. 0 = transparent, 1 = opaque.|
|`lineWidth`|`number`|The width (in pixels) of the line.|
|`lineDashSize`|`number`|For dashed lines, the size of the dash (in pixels).|
|`lineGapSize`|`number`|For dashed lines, the size of gap between the dashes (in pixels).|
|`textFormat`|`string`|The template used for the label for the terrain.|
|`elevatedTextFormat`|`string \| null`|The template used for the label for the terrai when elevation is not 0.|
|`textColor`|`string`|A hex string for the text color.|
|`textOpacity`|`number`|The opacity of the text. 0 = transparent, 1 = opaque.|
|`textSize`|`number`|The size of the text (in pixels).|
|`textRotation`|`boolean`|Whether or not the text label can be rotated to fit better.|

### Examples
```js
// Example: Find a terrain type by its name
const typeByName = terrainHeightTools.getTerrainType({ name: "Hard Cover" });
console.log(typeByName?.id);

// Example: Find a terrain type by its ID
const typeById = terrainHeightTools.getTerrainType({ id: "bikih5O35MH36Ltu" });
console.log(typeById?.name);
```

## getTerrainTypes

![Available Since v0.3.0](https://img.shields.io/badge/Available%20Since-v0.3.0-blue?style=flat-square)

Gets an array of all terrain types that have been configured in the system.

### Returns

An array of objects with the following properties:

|Name|Type|Description|
|-|-|-|
|`id`|`string`|A unique ID for this terrain type.|
|`name`|`string`|The name of this terrain type, as shown in the palette.|
|`usesHeight`|`boolean`|Whether or not the terrain type has a height value.|
|`isSolid`|`boolean`|Whether or not the terrain type is considered solid for the purposes of automatically adjusting token height (since v0.3.6).|
|`fillType`|`number`|The fill type used by the terrain type: 0 = none; 1 = solid; 2 = texture.|
|`fillColor`|`string`|A hex string for the fill color.|
|`fillOpacity`|`number`|The opacity of the fill. 0 = transparent, 1 = opaque.|
|`fillTexture`|`string`|The path to a texture to use when using texture fill mode.|
|`lineType`|`number`|The fill type used by the terrain type: 0 = none; 1 = solid; 2 = dashed.|
|`lineColor`|`string`|A hex string for the line color.|
|`lineOpacity`|`number`|The opacity of the line. 0 = transparent, 1 = opaque.|
|`lineWidth`|`number`|The width (in pixels) of the line.|
|`lineDashSize`|`number`|For dashed lines, the size of the dash (in pixels).|
|`lineGapSize`|`number`|For dashed lines, the size of gap between the dashes (in pixels).|
|`textFormat`|`string`|The template used for the label for the terrain.|
|`elevatedTextFormat`|`string \| null`|The template used for the label for the terrai when elevation is not 0.|
|`textColor`|`string`|A hex string for the text color.|
|`textOpacity`|`number`|The opacity of the text. 0 = transparent, 1 = opaque.|
|`textSize`|`number`|The size of the text (in pixels).|
|`textRotation`|`boolean`|Whether or not the text label can be rotated to fit better.|

## paintCells

![Available Since v0.1.4](https://img.shields.io/badge/Available%20Since-v0.1.4-blue?style=flat-square)
![Changed in v0.4.0](https://img.shields.io/badge/Changed%20In-v0.4.0-orange?style=flat-square)

Paints new terrain data onto the specified cells.

Users must have permissions to update the scene to use this.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`cells`|`[number, number][]`|*Required*|An array of cells to paint with new terrain data. Each element in the array should be a pair of numbers representing the X and Y coordinates of a cell. Note that these are grid coordinates, not pixel coordinates. The cells do not have to be adjacent.|
|`terrain`|`Object`|*Required*|Terrain data to apply to the specified cells. Either `id` or `name` must be provided.|
|`terrain.id`|`string`|`undefined`|If provided, will attempt to find a terrain type with this ID.
|`terrain.name`|`string`|`undefined`|If provided, will attempt to find a terrain type with this name. Note that this is case-sensitive. If multiple terrain types have the same name, the first will be returned.|
|`terrain.height`|`number`|`undefined`|The height of the terrain to paint onto the scene. Required when the specified terrain type uses height, ignored if the terrain type does not.|
|`terrain.elevation`|`number`|`undefined`|The elevation of the terrain to paint onto the scene (how heigh it is off the ground). Defaults to 0 when the specified terrain type uses height, ignored if the terrain type does not.|
|`options`|`Object`|`{}`||
|`options.mode`|`"totalReplace" \| "destructiveMerge" \| "additiveMerge"`|`"totalReplace"`|How to handle existing terrain: `"totalReplace"` - Completely overwrites all existing terrain data in the cells with the new data; `"additiveMerge"` - Merges the new terrain data with the existing data, without removing any overlapping terrain.; `"destructiveMerge"` - Merges the new terrain data with the existing data, removing existing overlapping terrain.|

### Returns

A `Promise<boolean>` that will resolve when the data has been saved to the scene. The boolean that is returned will indicate whether or not any changes were made to the terrain map.

### Example
```js
await terrainHeightTools.paintCells([
	[0, 1],
	[1, 1],
	[2, 1],
	[10, 10]
], {
	name: "Hard Cover",
	height: 2
});
```
