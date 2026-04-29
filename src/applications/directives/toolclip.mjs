import { nothing } from "lit";
import { AsyncDirective, directive } from "lit/async-directive.js";

const isMac = navigator.appVersion.includes("Mac");

class ToolclipDirective extends AsyncDirective {

	/**
	 * @param {ToolclipConfiguration | undefined} toolclipConfig
	 * @param {string | undefined} tooltip
	 */
	render(toolclipConfig, tooltip) {
		const showToolclips = game.settings.get("core", "showToolclips");
		if (toolclipConfig && showToolclips) {
			renderTemplate("templates/hud/toolclip.html", {
				...toolclipConfig,
				mod: isMac ? "⌘" : game.i18n.localize("CONTROLS.CtrlAbbr"),
				alt: isMac ? "⌥" : game.i18n.localize("CONTROLS.Alt")
			}).then(html => this.setValue(html));
		}

		// Fallback to tooltip when rendering is not yet done or toolclips are turned off
		return tooltip ? game.i18n.localize(tooltip) : nothing;
	}
}

export const toolclip = directive(ToolclipDirective);
