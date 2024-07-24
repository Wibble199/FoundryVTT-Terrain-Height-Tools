/**
 * @template {!(new (...args: any[]) => any)} T
 * @param {T} BaseClass
 */
export const withSubscriptions = BaseClass => class extends BaseClass {

	/**
	 * A collection of unsubscribe functions that will be called when closing the Application.
	 * @type {(() => void)[]}
	 */
	_subscriptions = [];

	/**
	 * Unsubscribes from all subscriptions.
	 */
	_unsubscribeFromAll() {
		this._subscriptions.forEach(unsubscribe => unsubscribe());
		this._subscriptions = [];
	}

	/** @returns {Promise<void>} */
	close(options) {
		this._unsubscribeFromAll();
		return super.close(options);
	}
};
