# Terrain Height Tools API

> [!NOTE]
> This page is only relevant to macro, script or module developers that want to integrate with Terrain Height Tools.

Terrain Height Tools exposes an API that can be used by macros, scripts or, other modules. This is available through the
global `terrainHeightTools` property. The following functions are available.

- [`calculateLineOfSight`](#calculatelineofsight)
- [`calculateLineOfSightByShape`](#calculatelineofsightbyshape)
- [`eraseCells`](#erasecells)
- [`getCell`](#getcell)
- [`getTerrainType`](#getterraintype)
- [`getTerrainTypes`](#getterraintypes)
- [`paintCells`](#paintcells)

## calculateLineOfSight

Computes a line sight test between two points in 3d space.

Note that this will always return an empty array if the line of sight ray is zero-length, even if the start/end point is within a shape.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`p1`|`{ x: number; y: number; h: number; }`|*Required*|The initial point that the LOS ray should begin from. The `x` and `y` coordinates are measured in pixels relative to the canvas. `h` is measured in an arbitrary unit, just as the terrains' heights are.|
|`p2`|`{ x: number; y: number; h: number; }`|*Required*|The point that the LOS ray should end. The `x` and `y` coordinates are measured in pixels relative to the canvas. `h` is measured in an arbitrary unit, just as the terrains' heights are.|
|`options`|`Object`|`{}`|Additional options for configuring the calculation.|
|`options.includeNoHeightTerrain`|`boolean`|`false`|If false, any terrain types that are configured as not using a height are excluded from the calculation. If true, these terrains are included, and their height is treated as if it were infinity.|

### Returns

An array of region objects where a ray drawn from `p1` to `p2` intersects or touches any terrain shapes.
- All regions will have a non-zero length.
- The regions will not overlap.
- There may be gaps _between_ regions if the line of sight ray does not intersect a terrain shape at this position.
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
|`terrainTypeId`|`string`|The ID of the terrain type that was intersected. In cases where the ray skims two terrain types, this will be the ID of the one that is defined first.|
|`height`|`number`|The height of the terrain type that was intersected. This is NOT the height at which the ray entered/left the shape. In cases where the ray skims two terrain types, this will be the highest of the two.|

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
const hasIntersectedWithHardCover = result.some(r => r.terrainTypeId == hardCoverTerrainType.id);
```

## calculateLineOfSightByShape

A more verbose version of `calculateLineOfSight`. Takes the same parameters but returns the intersections grouped by the shape that it occured on.

Regions are not merged with other shapes' regions, so in a case where two different shapes are touching and the line of sight ray skims between the two, this function will be able to detail both, whereas `calculateLineOfSight` would only show one.

In most cases, `calculateLineOfSight` is an easier function to use.

Note that this will always return an empty array if the line of sight ray is zero-length, even if the start/end point is within a shape.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`p1`|`{ x: number; y: number; h: number; }`|*Required*|The initial point that the LOS ray should begin from. The `x` and `y` coordinates are measured in pixels relative to the canvas. `h` is measured in an arbitrary unit, just as the terrains' heights are.|
|`p2`|`{ x: number; y: number; h: number; }`|*Required*|The point that the LOS ray should end. The `x` and `y` coordinates are measured in pixels relative to the canvas. `h` is measured in an arbitrary unit, just as the terrains' heights are.|
|`options`|`Object`|`{}`|Additional options for configuring the calculation.|
|`options.includeNoHeightTerrain`|`boolean`|`false`|If false, any terrain types that are configured as not using a height are excluded from the calculation. If true, these terrains are included, and their height is treated as if it were infinity.|

### Returns

An array of all shapes that were intersected by a ray drawn from `p1` to `p2`, along with the intersection regions for that shape.

|Name|Type|Description|
|-|-|-|
|`shape`|`Object`|An object containing details about the intersected shape.|
|`shape.height`|`number`|The height of the shape painted to the scene.|
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

## eraseCells

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

Fetches the terrain data from a specific cell.

### Parameters

|Name|Type|Default|Description|
|-|-|-|-|
|`x`|`number`|*Required*|The X coordinate of the cell to read. This is in grid coordinates, not pixel coordinates.|
|`y`|`number`|*Required*|The Y coordinate of the cell to read. This is in grid coordinates, not pixel coordinates.|

### Returns

Either `undefined` if the cell at the given coordinates is unpainted, or an object with the following properties.

|Name|Type|Description|
|-|-|-|
|`terrainTypeId`|`string`|The ID of the terrain type in this cell.|
|`height`|`number`|The height of the terrain in this cell.|

### Example
```js
const cell = terrainHeightTools.getCell(2, 3);

if (cell === undefined) {
	console.log("This cell is unpainted.");
} else {
	const terrainType = terrainHeightTools.getTerrainType({ id: cell.terrainTypeId });
	console.log(`${terrainType.name} is painted in this cell, at a height of ${cell.height}.`);
}
```

## getTerrainType

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

Gets an array of all terrain types that have been configured in the system.

### Returns

An array of objects with the following properties:

|Name|Type|Description|
|-|-|-|
|`id`|`string`|A unique ID for this terrain type.|
|`name`|`string`|The name of this terrain type, as shown in the palette.|
|`usesHeight`|`boolean`|Whether or not the terrain type has a height value.|
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
|`textColor`|`string`|A hex string for the text color.|
|`textOpacity`|`number`|The opacity of the text. 0 = transparent, 1 = opaque.|
|`textSize`|`number`|The size of the text (in pixels).|
|`textRotation`|`boolean`|Whether or not the text label can be rotated to fit better.|

## paintCells

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
|`options`|`Object`||
|`options.overwrite`|`boolean`|`true`|If `true`, cells that are already painted with a terrain will be overwritten with the given values. If `false` only unpainted cells are painted.|

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