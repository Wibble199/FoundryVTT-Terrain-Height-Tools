/**
 * Gets the vertical height of a token from the given token document.
 * @param {TokenDocument} tokenDoc
 * @returns {number}
 */
export function getTokenHeight(tokenDoc) {
	// Some systems need special handling to get accurate token sizes. This logic can go here.
	switch (game.system.id) {
		// In Lancer, size 0.5 tokens still take up 1 full grid size, so the default implementation would cause them to
		// appear as size 1 instead. Instead, we can access the size property of the actor.
		case "lancer":
			return tokenDoc.actor?.system?.size ?? tokenDoc.width;

		// Be default, we just use the token's width dimension as it's vertical height.
		default:
			return tokenDoc.width;
	}
}
