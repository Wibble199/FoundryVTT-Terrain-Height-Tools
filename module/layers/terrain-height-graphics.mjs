import { moduleName, settings } from "../consts.mjs";
import { Edge, HeightMap, Polygon, Vertex } from "../geometry/index.mjs";
import { distinctBy, groupBy } from "../utils/array-utils.mjs";
import { debug } from "../utils/log.mjs";

/**
 * Specialised PIXI.Graphics instance for rendering a scene's terrain height data to the canvas.
 */
export class TerrainHeightGraphics extends PIXI.Container {

	/** @type {PIXI.Texture} */
	cursorRadiusMaskTexture;

	/** @type {PIXI.Sprite} */
	cursorRadiusMask;

	constructor() {
		super();

		/** @type {PIXI.Graphics} */
		this.graphics = new PIXI.Graphics();
		this.addChild(this.graphics);

		/** @type {PIXI.Container} */
		this.labels = new PIXI.Container();
		this.addChild(this.labels);

		this.alpha = game.settings.get(moduleName, settings.showTerrainHeightOnTokenLayer) ? 1 : 0;
		this._setMaskRadius(this.terrainHeightLayerVisibilityRadius);
		Hooks.on("highlightObjects", this.#onHighlightObjects.bind(this));
	}

	// Sorting within the PrimaryCanvasGroup works by the `elevation`, then by whether it is a token, then by whether it
	// is a Drawing, then finally by the `sort`.
	// Using an elevation of 0 puts it at the same level as tokens, tiles (except overhead tiles, which are 4), drawings
	// etc. Using Infinity sort places it above the tiles, however because the PCG explicitly checks for DrawingShape
	// and TokenMesh, changing the sort won't make it appear over those.
	// End result should be below drawings, tokens, overhead tiles, but above ground-level tiles.
	get elevation() { return 0; }
	get sort() { return Infinity; }

	/** @type {number} */
	get terrainHeightLayerVisibilityRadius() {
		return game.settings.get(moduleName, settings.terrainHeightLayerVisibilityRadius);
	}

	/**
	 * Redraws the graphics layer using the supplied height map data.
	 * @param {HeightMap} heightMap
	 */
	async update(heightMap) {
		this.graphics.clear();
		this.labels.removeChildren();

		/** @type {import("../_types.mjs").TerrainType[]} */
		const terrainTypes = game.settings.get(moduleName, settings.terrainTypes);

		const t1 = performance.now();

		// Load textures
		const textures = Object.fromEntries(await Promise.all(terrainTypes
			.filter(type => type.fillTexture?.length)
			.map(async type => [type.id, await loadTexture(type.fillTexture)])));

		groupBy(heightMap.data, x => `${x.terrainTypeId}.${x.height}`).forEach(cells => {
			const terrainStyle = terrainTypes.find(t => t.id === cells[0].terrainTypeId);
			if (!terrainStyle) return;

			const height = cells[0].height;
			const label = terrainStyle.textFormat.replace(/\%h\%/g, height);
			const textStyle = this.#getTextStyle(terrainStyle);

			const polys = cells.map(({ position }) => ({ cell: position, poly: this.#getPolyPoints(...position) }));
			const mergedPolys = TerrainHeightGraphics.#combinePolygons(polys);
			mergedPolys.forEach(({ poly, holes, labelPosition }) => {
				this.#drawTerrainPolygon(poly, terrainStyle, textures);

				for (const hole of holes) {
					this.graphics.beginHole();
					this.#drawTerrainPolygon(hole);
					this.graphics.endHole();
				}

				if (label?.length)
					this.#drawPolygonLabel(label, textStyle, labelPosition);
			});
		});

		const t2 = performance.now();
		debug(`Terrain height rendering took ${t2 - t1}ms`)
	}

	/**
	 * Draws a terrain polygon for the given (pixel) coordinates and the given terrain style.
	 * @param {Polygon} polygon
	 * @param {import("../_types.mjs").TerrainType | undefined} terrainStyle
	 * @param {{ [terrainTypeId: string]: PIXI.Texture } | undefined} textureMap
	 */
	#drawTerrainPolygon(polygon, terrainStyle = undefined, textureMap = undefined) {
		const color = Color.from(terrainStyle?.fillColor ?? "#000000");
		if (terrainStyle?.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && textureMap[terrainStyle.id])
			this.graphics.beginTextureFill({
				texture: textureMap[terrainStyle.id],
				color,
				alpha: terrainStyle.fillOpacity
			});
		else
			this.graphics.beginFill(color, terrainStyle?.fillOpacity ?? 0.4);

		this.graphics.lineStyle({
			width: terrainStyle?.lineWidth ?? 0,
			color: Color.from(terrainStyle?.lineColor ?? "#000000"),
			alpha: terrainStyle?.lineOpacity ?? 1,
			alignment: 0
		});

		this.graphics.moveTo(polygon.points[0].x, polygon.points[0].y);
		for (let i = 1; i < polygon.points.length; i++) {
			this.graphics.lineTo(polygon.points[i].x, polygon.points[i].y);
		}
		this.graphics.lineTo(polygon.points[0].x, polygon.points[0].y);
		this.graphics.closePath();

		this.graphics.endFill();
	}

	/**
	 * Draws a polygon's label at the given position.
	 * @param {string} label
	 * @param {PIXI.TextStyle} textStyle
	 * @param {[number, number]} position
	 */
	#drawPolygonLabel(label, textStyle, position) {
		const text = new PreciseText(label, textStyle);
		text.x = position[0] - text.width / 2;
		text.y = position[1] - text.height / 2;
		this.labels.addChild(text);
	}

	/**
	 * @param {import("../_types.mjs").TerrainType} terrainStyle
	 * @returns {PIXI.TextStyle}
	 */
	#getTextStyle(terrainStyle) {
		const style = CONFIG.canvasTextStyle.clone();

		style.fontFamily = terrainStyle.font ?? CONFIG.defaultFontFamily;
		style.fontSize = terrainStyle.textSize;

		const color = Color.from(terrainStyle.textColor ?? 0xFFFFFF);
		style.fill = color;
		style.strokeThickness = 4;
		style.stroke = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;

		return style;
	}

	/**
	 * For the cell at the given x and y grid coordinates, returns the points to draw a poly at that location.
	 * The points are returned in a clockwise direction.
	 * @param {number} cx X cordinates of the cell to get points for.
	 * @param {number} cy Y cordinates of the cell to get points for.
	 * @returns {Polygon}
	 */
	#getPolyPoints(cx, cy) {
		// Gridless is not supported
		if (game.canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

		const [x, y] = game.canvas.grid.grid.getPixelsFromGridPosition(cx, cy);

		// Can get the points for a square grid easily
		if (game.canvas.grid.type === CONST.GRID_TYPES.SQUARE) {
			const { w, h } = game.canvas.grid;
			return new Polygon([
				new Vertex(x, y),
				new Vertex(x + w, y),
				new Vertex(x + w, y + h),
				new Vertex(x, y + h)
			]);
		}

		// For hex grids, can use the getPolygon function to generate them for us
		const pointsFlat = game.canvas.grid.grid.getPolygon(x, y)
		const polygon = new Polygon();
		for (let i = 0; i < pointsFlat.length; i += 2) {
			polygon.points.push(new Vertex(pointsFlat[i], pointsFlat[i + 1]));
		}
		return polygon;
	}

	/**
	 * Given a list of polygons, combines them together into as few polygons as possible.
	 * @param {{ poly: Polygon; cell: [number, number] }[]} originalPolygons An array of polygons to merge
	 * @returns {{ poly: Polygon; holes: Polygon[], labelPosition: [number, number] }[]}
	 */
	static #combinePolygons(originalPolygons) {

		// Generate a graph of all edges in all the polygons
		const allEdges = originalPolygons.flatMap(p => p.poly.edges.map(edge => ({ cell: p.cell, edge })));

		// Remove any duplicate edges
		for (let i = 0; i < allEdges.length; i++) {
			for (let j = i + 1; j < allEdges.length; j++) {
				if (allEdges[i].edge.equals(allEdges[j].edge)) {
					allEdges.splice(j, 1);
					allEdges.splice(i, 1);
					i--;
					break;
				}
			}
		}

		// From some start edge, keep finding the next edge that joins it until we are back at the start.
		// If there are multiple edges starting at a edge's endpoint (e.g. two squares touch by a corner), then
		// use the one that most clockwise.
		/** @type {{ poly: Polygon[]; labelPosition: [number, number] }} */
		const combinedPolygons = [];
		while (allEdges.length) {
			// Find the next unvisited edge, and follow the edges until we join back up with the first
			const edges = allEdges.splice(0, 1);
			while (!edges[0].edge.p1.equals(edges[edges.length - 1].edge.p2)) {
				// To find the next edge, we find edges that start where the last edge ends.
				// For hex grids (where a max of 3 edges can meet), there will only ever be 1 other edge here (as if
				// there were 4 edges, 2 would've overlapped and been removed) so we can just use that edge.
				// But for square grids, there may be two edges that start here. In that case, we want to find the one
				// that is next when rotating counter-clockwise.
				const nextEdgeCandidates = allEdges
					.map(({ edge }, idx) => ({ edge, idx }))
					.filter(v => v.edge.p1.equals(edges[edges.length - 1].edge.p2));

				if (nextEdgeCandidates.length === 0)
					throw new Error("Invalid graph detected. Missing edge.");

				const nextEdgeIndex = nextEdgeCandidates.length === 1
					? nextEdgeCandidates[0].idx
					: nextEdgeCandidates
						.map(({ edge, idx }) => ({ angle: edge.angleBetween(edges[edges.length - 1].edge), idx }))
						.sort((a, b) => a.angle - b.angle)[0].idx;

				const [nextEdge] = allEdges.splice(nextEdgeIndex, 1);
				edges.push(nextEdge);
			}

			// Calculate center of mass by averaging the midpoints of all painted grid cells.
			// Them, find the closest cell to that center of mass and use that as the label position.
			// Finding the closest cell ensures that the label will be inside the shape (in case it convex)
			const centerOfUsedCells = distinctBy(edges.map(e => e.cell), x => `${x[0]}.${x[1]}`)
				.map(([x, y]) => canvas.grid.grid.getPixelsFromGridPosition(x, y))
				.map(([x, y]) => [x + canvas.grid.w / 2, y + canvas.grid.h / 2]);

			const centerOfMass = centerOfUsedCells
				.reduce(([xAvg, yAvg, count], [x, y]) => [xAvg + (x - xAvg) / count, yAvg + (y - yAvg) / count, count + 1], [0, 0, 1])
				.slice(0, 2);

			/*const closestCell = centerOfUsedCells
				.map(cell => ({ cell, distSq: Math.pow(cell[0] - centerOfMass[0], 2) + Math.pow(cell[1] - centerOfMass[1], 2) }))
				.sort((a, b) => a.distSq - b.distSq)[0];*/

			// Add completed polygon to the list
			combinedPolygons.push({
				poly: new Polygon(edges.map(v => v.edge.p1)),
				labelPosition: centerOfMass
			});
		}

		// To determine if a polygon is a "hole" we need to check whether it is inside another polygon.
		// Since the polygon vertices are always the same direction, we can use to determine whether it is a hole: if
		// the points are going clockwise, then it IS NOT a hole, but if they are anti-clockwise then it IS a hole.
		// For each hole, we need to find which polygon it is a hole in, as the hole must be drawn immediately after.
		// To find the hole's parent, we search back up the sorted list of polygons in reverse for the first one that
		// contains it.
		const polysAreHolesMap = groupBy(combinedPolygons, polygon => !new Edge(polygon.poly.points[0], polygon.poly.points[1]).clockwise);
		const solidPolygons = (polysAreHolesMap.get(false) ?? []).map(p => ({ poly: p.poly, holes: /** @type {Polygon[]} */ ([]), labelPosition: p.labelPosition }));
		const holePolygons = polysAreHolesMap.get(true) ?? [];

		// For each hole, we need to check which non-hole poly it is inside. We gather a list of non-hole polygons that
		// contains it. If there is only one, we have found which poly it is a hole of. If there are more, we imagine a
		// horizontal line drawn from the topmost point of the inner polygon (with a little Y offset added so that we
		// don't have to worry about vertex collisions) to the left and find the first polygon that it intersects.
		for (const hole of holePolygons) {
			const containingPolygons = solidPolygons.filter(p => p.poly.contains(hole.poly));

			if (containingPolygons.length === 0) {
				debug("Something went wrong calculating which polygon this hole belonged to: No containing polygons found.", { hole: hole.poly, solidPolygons });
				//throw new Error("Could not find a parent polygon for this hole.");
				continue;

			} else if (containingPolygons.length === 1) {
				containingPolygons[0].holes.push(hole.poly);

			} else {
				const testPoint = hole.poly.points.find(p => p.y === hole.poly.boundingBox.y1).clone();
				testPoint.y += game.canvas.grid.h * 0.05;
				const intersectsWithEdges = containingPolygons.flatMap(poly => poly.poly.edges
					.map(edge => ({
						intersectsAt: edge.intersectsYAt(testPoint.y),
						poly
					}))
					.filter(x => x.intersectsAt && x.intersectsAt < testPoint.x)
				);

				if (intersectsWithEdges.length === 0) {
					debug("Something went wrong calculating which polygon this hole belonged to: No edges intersected horizontal ray.", { hole: hole.poly, solidPolygons });
					//throw new Error("Could not find a parent polygon for this hole.");
					continue;
				}

				intersectsWithEdges.sort((a, b) => b.intersectsAt - a.intersectsAt);
				intersectsWithEdges[0].poly.holes.push(hole.poly);
			}
		}

		return solidPolygons;
	}

	setVisible(visible) {
		return CanvasAnimation.animate([
			{
				parent: this,
				attribute: "alpha",
				to: visible ? 1 : 0
			}
		], { duration: 250 });
	}

	/**
	 * Turns on or off the mask used to only show the height around the user's cursor.
	 * @param {boolean} active
	 */
	_setMaskRadiusActive(active) {
		this._setMaskRadius(active ? this.terrainHeightLayerVisibilityRadius : 0);
	}

	/**
	 * Sets the radius of the mask used to only show the height around the user's cursor.
	 * @param {number} radius The radius of the height map mask. Use <=0 to disable.
	 */
	_setMaskRadius(radius) {
		debug(`Updating terrain height layer graphics mask size to ${radius}`);

		// Remove previous mask
		this.mask = null;
		if (this.cursorRadiusMask) this.removeChild(this.cursorRadiusMask);
		game.canvas.app.renderer.plugins.interaction.off("mousemove", this.#updateCursorMaskPosition);

		// Stop here if not applying a new mask
		if (radius <= 0) return;

		// Create a radial gradient texture
		radius *= game.canvas.grid.size;

		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = radius * 2;

		const context = canvas.getContext("2d");
		const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
		gradient.addColorStop(0.8, "rgba(255, 255, 255, 1)");
		gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

		context.fillStyle = gradient;
		context.fillRect(0, 0, radius * 2, radius * 2);

		const texture = new PIXI.Texture.from(canvas);

		// Create sprite
		this.cursorRadiusMask = new PIXI.Sprite(texture);
		this.cursorRadiusMask.anchor.set(0.5);
		this.addChild(this.cursorRadiusMask);

		// Get current mouse coordinates
		const pos = this.toLocal(game.canvas.app.renderer.plugins.interaction.mouse.global);
		this.cursorRadiusMask.position.set(pos.x, pos.y);

		// Set mask
		this.mask = this.cursorRadiusMask;
		game.canvas.app.renderer.plugins.interaction.on("mousemove", this.#updateCursorMaskPosition);
	}

	#updateCursorMaskPosition = event => {
		const pos = this.toLocal(event.data.global);
		this.cursorRadiusMask.position.set(pos.x, pos.y);
	}

	#onHighlightObjects(active) {
		// When using the "highlight objects" keybind, if the user has the radius option enabled and we're on the token
		// layer, show the entire height map
		if (game.canvas.activeLayer.name === "TokenLayer" && this.terrainHeightLayerVisibilityRadius > 0) {
			this._setMaskRadiusActive(active);
		}
	}
}
