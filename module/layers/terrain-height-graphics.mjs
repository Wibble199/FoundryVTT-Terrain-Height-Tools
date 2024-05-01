import { moduleName, settings } from "../consts.mjs";
import { Edge, HeightMap, Polygon, Vertex } from "../geometry/index.mjs";
import { groupBy } from "../utils/array-utils.mjs";
import { debug } from "../utils/log.mjs";

/**
 * Specialised PIXI.Graphics instance for rendering a scene's terrain height data to the canvas.
 */
export default class TerrainHeightGraphics extends PIXI.Graphics {

	/** @type {PIXI.Texture} */
	cursorRadiusMaskTexture;

	/** @type {PIXI.Sprite} */
	cursorRadiusMask;

	constructor() {
		super();
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
	 * Redraws the graphics layer using the supplied data.
	 * @param {HeightMap} data
	 */
	update(data) {
		TokenLayer
		this.clear();

		const t1 = performance.now();

		const polys = data.gridCoordinates.map(([x, y]) => this.#getPolyPoints(x, y));
		const mergedPolys = TerrainHeightGraphics.#combinePolygons(polys);
		mergedPolys.forEach(({ poly, holes }) => {
			this.drawPolygonLt(poly);

			for (const hole of holes) {
				this.beginHole();
				this.drawPolygonLt(hole);
				this.endHole();
			}
		});

		const t2 = performance.now();
		debug(`Terrain height rendering took ${t2 - t1}ms`)
	}

	/**
	 * Draws a polygon using moveTo/lineTo.
	 * @param {Polygon} polygon
	 */
	drawPolygonLt(polygon) {
		this.beginFill(0xFF0000, 0.4);
		this.lineStyle({ width: 8, color: 0xFF0000, alpha: 0.8, alignment: 0 });

		this.moveTo(polygon.points[0]);
		for (let i = 1; i < polygon.points.length; i++) {
			this.lineTo(polygon.points[i]);
		}
		this.lineTo(polygon.points[0]);
		this.closePath();

		this.endFill();
	}

	/**
	 * Extends the existing moveTo method to allow also taking an object with an x and y.
	 * @param {number | { x: number; y: number }} x Either the X position, or an object with an X and Y component.
	 * @param {number | undefined} y If X was a number, the Y position; otherwise undefined.
	 * @override
	 */
	moveTo(x, y = undefined) {
		if (typeof x === "number")
			return super.moveTo(x, y);
		return super.moveTo(x.x, x.y);
	}

	/**
	 * Extends the existing lineTo method to allow also taking an object with an x and y.
	 * @param {number | { x: number; y: number }} x Either the X position, or an object with an X and Y component.
	 * @param {number | undefined} y If X was a number, the Y position; otherwise undefined.
	 * @override
	 */
	lineTo(x, y = undefined) {
		if (typeof x === "number")
			return super.lineTo(x, y);
		return super.lineTo(x.x, x.y);
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
	 * @param {Polygon[]} originalPolygons An array of polygons to
	 * @returns {{ poly: Polygon; holes: Polygon[] }[]}
	 */
	static #combinePolygons(originalPolygons) {

		// Generate a graph of all edges in all the polygons
		const allEdges = originalPolygons.flatMap(p => p.edges);

		// Remove any duplicate edges
		for (let i = 0; i < allEdges.length; i++) {
			for (let j = i + 1; j < allEdges.length; j++) {
				if (allEdges[i].equals(allEdges[j])) {
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
		/** @type {Polygon[]} */
		const combinedPolygons = [];
		while (allEdges.length) {
			const edges = allEdges.splice(0, 1);
			while (!edges[0].p1.equals(edges[edges.length - 1].p2)) {
				// TODO: handle corner joins
				// TODO: in square grids, we can optimise edges by joining those that are adjacent and parallel.
				const nextEdgeIndex = allEdges.findIndex(v => v.p1.equals(edges[edges.length - 1].p2));
				if (nextEdgeIndex === -1) throw new Error("Invalid graph detected. Missing edge.");
				const [nextEdge] = allEdges.splice(nextEdgeIndex, 1);
				edges.push(nextEdge);
			}
			combinedPolygons.push(new Polygon(edges.map(v => v.p1)));
		}

		// To determine if a polygon is a "hole" we need to check whether it is inside another polygon.
		// Since the polygon vertices are always the same direction, we can use to determine whether it is a hole: if
		// the points are going clockwise, then it IS NOT a hole, but if they are anti-clockwise then it IS a hole.
		// For each hole, we need to find which polygon it is a hole in, as the hole must be drawn immediately after.
		// To find the hole's parent, we search back up the sorted list of polygons in reverse for the first one that
		// contains it.
		const polysAreHolesMap = groupBy(combinedPolygons, polygon => !new Edge(polygon.points[0], polygon.points[1]).clockwise);
		const solidPolygons = (polysAreHolesMap.get(false) ?? []).map(poly => ({ poly, holes: /** @type {Polygon[]} */ ([]) }));
		const holePolygons = polysAreHolesMap.get(true) ?? [];

		// For each hole, we need to check which non-hole poly it is inside. We gather a list of non-hole polygons that
		// contains it. If there is only one, we have found which poly it is a hole of. If there are more, we imagine a
		// horizontal line drawn from the topmost point of the inner polygon (with a little Y offset added so that we
		// don't have to worry about vertex collisions) to the left and find the first polygon that it intersects.
		for (const hole of holePolygons) {
			const containingPolygons = solidPolygons.filter(p => p.poly.contains(hole));

			if (containingPolygons.length === 0) {
				debug("Something went wrong calculating which polygon this hole belonged to: No containing polygons found.", { hole, solidPolygons });
				//throw new Error("Could not find a parent polygon for this hole.");
				continue;

			} else if (containingPolygons.length === 1) {
				containingPolygons[0].holes.push(hole);

			} else {
				const testPoint = hole.points.find(p => p.y === hole.boundingBox.y1).clone();
				testPoint.y += game.canvas.grid.h * 0.05;
				const intersectsWithEdges = containingPolygons.flatMap(poly => poly.poly.edges
					.map(edge => ({
						intersectsAt: edge.intersectsYAt(testPoint.y),
						poly
					}))
					.filter(x => x.intersectsAt && x.intersectsAt < testPoint.x)
				);

				if (intersectsWithEdges.length === 0) {
					debug("Something went wrong calculating which polygon this hole belonged to: No edges intersected horizontal ray.", { hole, solidPolygons });
					//throw new Error("Could not find a parent polygon for this hole.");
					continue;
				}

				intersectsWithEdges.sort((a, b) => b.intersectsAt - a.intersectsAt);
				intersectsWithEdges[0].poly.holes.push(hole);
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
