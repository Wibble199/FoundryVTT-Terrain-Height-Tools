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
  
  // Apply new bar settings to all prototype tokens
  // Update actor flags without overriding other flags
  await Promise.all(game.actors.map(a => {
	let barSettings;
  
	// Determine which bar settings to use based on actor type
	switch (a.type) {
	  case 'npc':
		barSettings = npcBars;
		break;
	  case 'pilot':
		barSettings = pilotBars;
		break;
	  case 'deployable':
		barSettings = deployableBars;
		break;
	  default:
		barSettings = mechBars; // Use mechBars by default
		break;
	}
  
	// Get existing flags to preserve them
	const existingFlags = a.flags || {};
	
	// Update the actor while preserving the flags
	return a.update({
	  "flags.barbrawl.resourceBars": barSettings,
	  flags: {
		...existingFlags, // Merge existing flags
		barbrawl: {
		  ...existingFlags.barbrawl,
		  resourceBars: barSettings
		}
	  }
	}, { 'diff': false, 'recursive': false });
  }));
  
  // Reset all tokens' bars in all scenes
  await Promise.all(
	game.scenes.map(async s => {
	  const updates = s.tokens.filter(t => t.actor).map(t => {
		let barSettings;
  
		// Determine which bar settings to use based on token's actor type
		switch (t.actor.type) {
		  case 'npc':
			barSettings = npcBars;
			break;
		  case 'pilot':
			barSettings = pilotBars;
			break;
		  case 'deployable':
			barSettings = deployableBars;
			break;
		  default:
			barSettings = mechBars; // Use mechBars by default
			break;
		}
  
		return {
		  _id: t.id,
		  "flags.barbrawl.resourceBars": barSettings,
		  flags: {
			...t.flags, // Preserve existing token flags
			barbrawl: {
			  ...t.flags?.barbrawl,
			  resourceBars: barSettings
			}
		  }
		};
	  });
  
	  return s.updateEmbeddedDocuments("Token", updates, { 'diff': false, 'recursive': false });
	})
  );
  
  ui.notifications.info("Done");
  // vim:ft=javascript: