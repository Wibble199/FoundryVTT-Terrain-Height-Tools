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

const mechBars = {
	burn: {
	  id: "burn",
	  attribute: "burn",
	  mincolor: "#992222",
	  maxcolor: "#992222",
	  position: "top-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  style: "none",
	},
	
	overshield: {
	  id: "overshield",
	  attribute: "overshield.value",
	  mincolor: "#222299",
	  maxcolor: "#222299",
	  position: "top-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  style: "none",
	},
	
	bar5: {
	  id: "bar5",
	  attribute: "overcharge",
	  mincolor: "#eed202",
	  maxcolor: "#f2b50d",
	  position: "left-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: 8,
	  indentRight: 68,
	  shareHeight: true,
	  style: "none",
	  subdivisionsOwner: true,
	  fgImage: "assets/bars/OverchargeBar.svg",
	  bgImage: "assets/bars/EmptyOverchargeBar.svg",
	  opacity: 100,
	  subdivisions: 3,
	  max: 3,
	},
	
	bar4: {
	  id: "bar4",
	  attribute: "core_energy",
	  mincolor: "#1eff00",
	  maxcolor: "#00ff1e",
	  position: "left-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: null,
	  indentRight: 92,
	  shareHeight: true,
	  style: "none",
	  fgImage: "assets/bars/LeftCPBar.svg",
	  bgImage: "assets/bars/LeftEmptyCPBar.svg",
	  opacity: 100,
	  subdivisions: 1,
	  subdivisionsOwner: true,
	  max: 1,
	},
	
	bar1: {
	  id: "bar1",
	  attribute: "hp",
	  mincolor: "#FF0000",
	  maxcolor: "#80FF00",
	  position: "bottom-inner",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: null,
	  indentRight: 5,
	  shareHeight: true,
	  style: "fraction",
	  label: "        ",
	  fgImage: "assets/bars/HPBarCutout.svg",
	  bgImage: "assets/bars/EmptyHPBarCutout.svg",
	  opacity: 100,
	},
	
	bar6: {
	  id: "bar6",
	  attribute: "structure",
	  mincolor: "#1F9EFF",
	  maxcolor: "#1F9EFF",
	  position: "bottom-inner",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: null,
	  indentRight: 70,
	  shareHeight: true,
	  style: "none",
	  subdivisions: 4,
	  subdivisionsOwner: true,
	  fgImage: "assets/bars/StructureBar.svg",
	  bgImage: "assets/bars/EmptyStructureBar.svg",
	  opacity: 100,
	},
	
	bar7: {
	  id: "bar7",
	  attribute: "stress",
	  mincolor: "#FF7B00",
	  maxcolor: "#FF7B00",
	  position: "bottom-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: null,
	  indentRight: 70,
	  shareHeight: true,
	  style: "none",
	  subdivisions: 4,
	  subdivisionsOwner: true,
	  fgImage: "assets/bars/ReactorStressBar.svg",
	  bgImage: "assets/bars/EmptyReactorStressBar.svg",
	  opacity: 100,
	},
	
	bar3: {
	  id: "bar3",
	  attribute: "heat",
	  mincolor: "#5f9e00",
	  maxcolor: "#990000",
	  position: "bottom-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: null,
	  indentRight: 5,
	  shareHeight: true,
	  style: "fraction",
	  label: "        ",
	  invertDirection: false,
	  fgImage: "assets/bars/HeatBarCutout.svg",
	  bgImage: "assets/bars/EmptyHeatBarCutout.svg",
	  opacity: 100,
	},
	
	bar2: {
	  id: "bar2",
	  attribute: "repairs",
	  mincolor: "#333333",
	  maxcolor: "#333333",
	  position: "left-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: null,
	  indentRight: 68,
	  style: "none",
	  fgImage: "assets/bars/RepairBar.svg",
	  bgImage: "assets/bars/EmptyRepairBar.svg",
	  opacity: 100,
	},
  };
  
  const npcBars = {
	bar1: {
	  order: 2,
	  id: "bar1",
	  attribute: "hp",
	  mincolor: "#FF0000",
	  maxcolor: "#80FF00",
	  position: "bottom-inner",
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  hideNoCombat: true,
	  indentLeft: 20,
	  indentRight: 19,
	  shareHeight: true,
	  style: "user",
	  subdivisions: 4,
	  fgImage: "assets/bars/HPBar.svg",
	  bgImage: "assets/bars/EmptyHPBar.svg",
	  opacity: 100,
	},
	bar2: {
	  order: 5,
	  id: "bar2",
	  attribute: "heat",
	  mincolor: "#5f9e00",
	  maxcolor: "#990000",
	  position: "bottom-outer",
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  hideNoCombat: true,
	  indentLeft: 20,
	  indentRight: 19,
	  shareHeight: true,
	  invertDirection: false,
	  style: "user",
	  subdivisions: 4,
	  fgImage: "assets/bars/HeatBar.svg",
	  bgImage: "assets/bars/EmptyHeatBar.svg",
	  opacity: 100,
	},
	burn: {
	  order: 0,
	  id: "burn",
	  attribute: "burn",
	  mincolor: "#992222",
	  maxcolor: "#992222",
	  position: "top-outer",
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.NONE,
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  style: "none",
	},
	overshield: {
	  order: 1,
	  id: "overshield",
	  attribute: "overshield.value",
	  mincolor: "#222299",
	  maxcolor: "#222299",
	  position: "top-outer",
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.NONE,
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  style: "none",
	},
	bar3: {
	  order: 3,
	  id: "bar3",
	  attribute: "structure",
	  mincolor: "#1F9EFF",
	  maxcolor: "#1F9EFF",
	  position: "bottom-inner",
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: null,
	  indentRight: 80,
	  shareHeight: true,
	  style: "fraction",
	  fgImage: "assets/bars/NPCStructureBar.svg",
	  bgImage: "assets/bars/NPCEmptyStructureBar.svg",
	  opacity: 100,
  
	},
	bar4: {
	  order: 4,
	  id: "bar4",
	  attribute: "stress",
	  mincolor: "#FF7B00",
	  maxcolor: "#FF7B00",
	  position: "bottom-outer",
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentLeft: null,
	  indentRight: 80,
	  shareHeight: true,
	  style: "fraction",
	  fgImage: "assets/bars/NPCReactorStressBar.svg",
	  bgImage: "assets/bars/NPCEmptyReactorStressBar.svg",
	  opacity: 100,
	},
  };
  
  const pilotBars = {
	bar1: {
	  order: 0,
	  id: "bar1",
	  attribute: "bond_state.stress",
	  mincolor: "#FF0000",
	  maxcolor: "#FF0000",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  position: "bottom-outer",
	  indentLeft: 20,
	  indentRight: 20,
	  style: "user",
	  subdivisions: 8,
	  subdivisionsOwner: true,
	},
	burn: {
	  order: 1,
	  id: "burn",
	  attribute: "burn",
	  mincolor: "#992222",
	  maxcolor: "#992222",
	  position: "top-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  style: "none",
	},
	overshield: {
	  order: 2,
	  id: "overshield",
	  attribute: "overshield.value",
	  mincolor: "#222299",
	  maxcolor: "#222299",
	  position: "top-outer",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  style: "none",
	},
	bar2: {
	  order: 3,
	  id: "bar2",
	  attribute: "bond_state.xp",
	  mincolor: "#054545",
	  maxcolor: "#054545",
	  position: "bottom-outer",
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.NONE,
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  indentRight: 20,
	  indentLeft: 20,
	  hideCombat: true,
	  hideNoCombat: false,
	  subdivisions: 8,
	  subdivisionsOwner: true,
	  style: "none",
	},
  };
  
  const deployableBars = {
	bar1: {
	  order: 0,
	  id: "bar1",
	  attribute: "hp",
	  mincolor: "#1F9EFF",
	  maxcolor: "#1F9EFF",
	  ownerVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  otherVisibility: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
	  position: "bottom-inner",
	  indentLeft: 20,
	  indentRight: 20,
	  style: "fraction",
	  subdivisions: 4,
	  subdivisionsOwner: false,
	},
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