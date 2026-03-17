/* eslint-disable no-unused-vars */

const applications = new Map();

/**
 * Base class from which tools for the terrain height editor layer can extend from.
 */
export class AbstractEditorTool {

	/**
	 * If set, an application of this type will be rendered while
	 * @type {typeof Application}
	 */
	static APPLICATION_TYPE;

	/** If the left mouse button is currently being held. */
	isMouseLeftDown = false;

	/** If the right mouse button is currently being held. */
	isMouseRightDown = false;

	constructor() {
		this._renderApplication();
	}

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
	 * Note that overriding classes must call `super._cleanup()`.
	 */
	_cleanup() {
		applications.get(this.constructor.APPLICATION_TYPE)?.close({ animate: false });
	}

	/**
	 * Called to render the application to the scene.
	 * @protected
	 */
	_renderApplication() {
		const { APPLICATION_TYPE } = this.constructor;
		if (!APPLICATION_TYPE) return;

		let applicationInstance = applications.get(APPLICATION_TYPE);
		if (!applicationInstance) {
			applicationInstance = new APPLICATION_TYPE();
			applications.set(APPLICATION_TYPE, applicationInstance);

			// Only position it once so that if the user moves it, we keep it in the same place
			Hooks.once(`render${APPLICATION_TYPE.name}`, () => {
				const left = ui.sidebar?.element[0].getBoundingClientRect()?.left;
				applicationInstance.setPosition({
					top: 5,
					left: left - APPLICATION_TYPE.DEFAULT_OPTIONS.position.width - 7
				});
			});
		}

		applicationInstance.render(true);
	}
}
