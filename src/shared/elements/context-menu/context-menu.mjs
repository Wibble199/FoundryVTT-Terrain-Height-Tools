import { html, LitElement } from "lit";
import { when } from "lit/directives/when.js";
import "./context-menu.css";

/**
 * @typedef {Object} ContextMenuItem
 * @property {string} label
 * @property {string} [icon]
 * @property {() => void} [onClick]
 * @property {ContextMenuItem[]} [children]
 * @property {undefined | "separator"} [type]
 */

export const elementName = "context-menu-fwl";

/** @type {HTMLDivElement | undefined} */
let container;

export class ContextMenu extends LitElement {

	static properties = {
		items: { type: Array }
	};

	/** @type {ContextMenu | undefined} */
	static active;

	/** @type {ContextMenu | undefined} */
	_subMenu;

	/** @type {AbortController | undefined} */
	#abortController;

	constructor() {
		super();

		/** @type {ContextMenuItem[]} */
		this.items = [];

		/** @type {ContextMenu | undefined} */
		this._parentMenu = undefined;

		/** @type {HTMLLIElement | undefined} */
		this._parentMenuItem = undefined;
	}

	render() {
		return html`
			<menu class="dropdown-menu-fwl dropdown-menu-fwl-hover" @mousedown=${this.#onMenuMouseDown}>
				${this.items.map(this.#renderItem)}
			</menu>
		`;
	}

	/**
	 * @param {ContextMenuItem} item
	 * @param {number} idx
	 */
	#renderItem = (item, idx) => {
		switch (item.type) {
			case "separator":
				return html`<li class="context-menu-fwl-separator"></li>`;

			default:
				return html`<li class="context-menu-fwl-item" data-item-index=${idx}>
					${when(item.icon, () => html`<i class=${item.icon}></i>`)}
					<span>${item.label}</span>
					${when(item.children?.length, () => html`<i class="fas fa-caret-right"></i>`)}
				</li>`;
		}
	};

	updated() {
		const { top, left, width, height } = this.getBoundingClientRect();

		// Position menu upwards if not enough space below
		// If there is a parent menu, position it so that the bottom of this submenu is at the bottom of the parent item
		if (top + height > window.innerHeight) {
			const parentItemHeight = this._parentMenuItem?.getBoundingClientRect()?.height ?? 0;
			this.style.top = `${top - height + parentItemHeight}px`;
		}

		// Position menu leftwards if not enough space to the right
		// If there is a parent menu, position it so that this is left of the parent
		if (left + width > window.innerWidth) {
			const parentWidth = this._parentMenu?.getBoundingClientRect()?.width ?? 0;
			this.style.left = `${left - width - parentWidth}px`;
		}
	}

	connectedCallback() {
		super.connectedCallback();

		// Don't add events to any sub-menus as it becomes messy with the parent's event listeners.
		if (!this._parentMenu) {
			this.#abortController = new AbortController();
			const { signal } = this.#abortController;

			document.addEventListener("mousedown", this.#onDocumentMouseDown, { signal });
			document.addEventListener("keydown", this.#onDocumentKeyDown, { signal });
		}
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.#abortController?.abort();
	}

	/** @param {MouseEvent} e */
	#onMenuMouseDown = e => {
		const itemIdx = +e.target.closest("[data-item-index]")?.dataset.itemIndex;
		if (isNaN(itemIdx)) return;

		const item = this.items[itemIdx];
		if (item.children?.length) {
			this._subMenu?.close();
			const li = e.target.closest("li");
			const { y } = li.getBoundingClientRect();
			const { x, width } = this.getBoundingClientRect();
			this._subMenu = ContextMenu.open({ x: x + width, y }, item.children, { parentMenu: this, parentMenuItem: li });
		} else {
			item.onClick?.();
			this.close();
		}
	};

	/** @param {KeyboardEvent} e */
	#onDocumentKeyDown = e => {
		// Close on 'Escape' key press
		if (e.key === "Escape")
			this.close();
	};

	/** @param {MouseEvent} e */
	#onDocumentMouseDown = e => {
		// Close on mouse outside. Do after tiny delay so that onMenuClick fires first.
		setTimeout(() => {
			if (!this._isTargetInside(e.target))
				this.close();
		}, 1);
	};

	/**
	 * Closes this context menu and any sub-menus.
	 */
	close() {
		// Remove from DOM
		if (this.parentElement)
			this.remove();

		// Recursively close sub-menus
		this._subMenu?.close();

		// If this was a sub-menu, then unassign itself from parent
		if (this._parentMenu?._subMenu === this)
			this._parentMenu._subMenu = undefined;
	}

	/**
	 * Checks whether the target element is inside this context menu, or any of it's sub-menus.
	 * @param {Node} target
	 * @returns {boolean}
	 */
	_isTargetInside(target) {
		return target === this || this.contains(target) || !!this._subMenu?._isTargetInside(target);
	}

	createRenderRoot() {
		return this;
	}

	/**
	 * @param {{ x: number; y: number; } | Event} e Position of the menu, or an event to use.
	 * @param {(ContextMenuItem | false | null | undefined)[]} items Any falsy elements will be ignored.
	 * @param {Object} [options]
	 * @param {ContextMenu} [options.parentMenu]
	 * @param {HTMLLIElement} [options.parentMenuItem]
	 */
	static open(e, items, { parentMenu, parentMenuItem } = {}) {
		if (!container) {
			container = document.createElement("div");
			container.id = "context-menu-fwl-container";
			document.body.appendChild(container);
		}

		const position = e instanceof Event
			? { x: e.clientX, y: e.clientY }
			: e;

		/** @type {ContextMenu} */
		const element = document.createElement(elementName);
		element.items = items.filter(Boolean);
		element._parentMenu = parentMenu;
		element._parentMenuItem = parentMenuItem;
		element.style.left = `${position.x}px`;
		element.style.top = `${position.y}px`;
		container.appendChild(element);

		return element;
	}
}

if (!customElements.get(elementName)) {
	customElements.define(elementName, ContextMenu);
}
