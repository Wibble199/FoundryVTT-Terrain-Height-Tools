/**
 * Mixin for Application which positions it in the top right of the canvas area on first render.
 * @template {!(new (...args: any[]) => any)} T
 * @param {T} BaseClass
 */
export const ThtApplicationPositionMixin = BaseClass => class extends BaseClass {

	/** @override */
	_configureRenderOptions(options) {
		super._configureRenderOptions(options);

		if (options.isFirstRender) {
			options.position.left ??= ui.sidebar?.element.getBoundingClientRect()?.left - this.constructor.DEFAULT_OPTIONS.position.width - 7;
			options.position.top ??= 5;
		}
	}
};
