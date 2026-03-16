/* eslint-disable no-unused-vars */

/**
 * Base class from which tools for the terrain height editor layer can extend from.
 */
export class AbstractEditorTool {

	/** If the left mouse button is currently being held. */
	isMouseLeftDown = false;

	/** If the right mouse button is currently being held. */
	isMouseRightDown = false;

	/**
	 * Handler for when the mouse is pressed down.
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseDownLeft(x, y) {}

	/**
	 * Handler for when the mouse is pressed down.
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseDownRight(x, y) {}

	/**
	 * Handler for when the mouse is moved.
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseMove(x, y) {}

	/**
	 * Handler for when the mouse is pressed down.
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseUpLeft(x, y) {}

	/**
	 * Handler for when the mouse is pressed down.
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseUpRight(x, y) {}

	/**
	 * Called when the the tool is deselected, and can be used to clean up any state.
	 */
	_cleanup() {}
}
