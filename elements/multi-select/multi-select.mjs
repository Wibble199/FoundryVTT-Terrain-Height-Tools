import { html, LitElement, render as litRender } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { when } from "lit/directives/when.js";
import "./multi-select.css";

export const elementName = "multi-select-fwl";

export class MultiSelect extends LitElement {

	static properties = {
		items: { type: Array },
		value: { type: Array, reflect: true },
		placeholder: { type: String },
		labelSelector: { type: String },
		valueSelector: { type: String },
		_isOpen: { state: true }
	};

	static formAssociated = true;

	/** @type {HTMLDivElement | null} */
	#dropdownContainer = null;

	/** @type {AbortController | null} */
	#abortController;

	constructor() {
		super();
		this._internals = this.attachInternals();

		this.items = [];

		/** @type {any[] | null} */
		this.value = [];

		this.placeholder = "";
		this._isOpen = false;

		/** @type {string | ((item: any) => any) | undefined} */
		this.labelSelector = undefined;

		/** @type {string | ((item: any) => any) | undefined} */
		this.labelSelector = undefined;
	}

	get #buttonLabel() {
		if (!this.value?.length)
			return "";

		const itemsValues = this.items.map((item, index) => ({ item, value: this.#getItemValue(item), index }));

		return this.value
			.map(value => itemsValues.find(x => x.value === value))
			.sort((a, b) => a.index - b.index)
			.map(x => this.#getItemLabel(x.item))
			.join(", ");
	}

	render() {
		return html`
			<div class="multi-select-fwl-button" @mousedown=${() => this._isOpen = !this._isOpen}>
				<div class="multi-select-fwl-button-label-container">
					${when(!this.value?.length, () => html`
						<span class="multi-select-fwl-button-label-placeholder">${this.placeholder}</span>
					`, () => html`
						<span class="multi-select-fwl-button-label-primary">${this.#buttonLabel}</span>
						<span class="multi-select-fwl-button-label-alternate">${this.value.length} selected</span>
					`)}
				</div>
				<i class="fas fa-chevron-down"></i>
			</div>
		`;
	}

	#renderDropdown() {
		// Remove the container if the DD is now closed
		if (!this._isOpen) {
			if (this.#dropdownContainer) {
				this.#dropdownContainer.remove();
				this.#dropdownContainer = null;
			}
			return;
		}

		// Create the container if required
		if (!this.#dropdownContainer) {
			this.#dropdownContainer = document.createElement("div");
			this.#dropdownContainer.classList.add("multi-select-fwl-dropdown");
			document.body.appendChild(this.#dropdownContainer);
		}

		// Render dropdown into the container
		const selectedValues = new Set(this.value ?? []);

		litRender(html`<menu class="dropdown-menu-fwl dropdown-menu-fwl-hover">
			${this.items.map(item => html`
				<li
					class=${classMap({ checked: selectedValues.has(this.#getItemValue(item)) })}
					@click=${() => this.#toggleItem(item)}>
					<i class="fas fa-check"></i>
					<span>${this.#getItemLabel(item)}</span>
				</li>
			`)}
		</menu>`, this.#dropdownContainer);
	}

	connectedCallback() {
		super.connectedCallback();

		if (!this.hasAttribute("tabindex"))
			this.setAttribute("tabindex", 0);

		this.#abortController = new AbortController();
		const { signal } = this.#abortController;

		document.addEventListener("mousedown", this.#onDocumentMouseDown, { signal });
		document.addEventListener("keydown", this.#onDocumentKeyDown, { signal });
	}

	disconnectedCallback() {
		super.disconnectedCallback();

		this.#abortController.abort();

		this.#dropdownContainer?.remove();
		this.#dropdownContainer = null;
	}

	/** @param {Map<string, any>} changedProperties  */
	update(changedProperties) {
		super.update(changedProperties);

		if (changedProperties.has("_isOpen"))
			this.classList.toggle("multi-select-fwl-open", this._isOpen);

		this.#renderDropdown();
	}

	updated() {
		this.#updateLabel();
		this.#updateDropdownPosition();
	}

	#updateLabel() {
		// When rendering, check to see if the primary label is longer than the available space.
		// If so, hide the primary label and show the alternative label
		const primaryLabel = this.querySelector(".multi-select-fwl-button-label-primary");
		const alternateLabel = this.querySelector(".multi-select-fwl-button-label-alternate");
		if (!primaryLabel || !alternateLabel) return;

		const isPrimaryOverflowing = primaryLabel.scrollWidth > primaryLabel.clientWidth;
		primaryLabel.style.opacity = isPrimaryOverflowing ? 0 : 1;
		alternateLabel.style.opacity = isPrimaryOverflowing ? 1 : 0;
	}

	#updateDropdownPosition() {
		if (!this.#dropdownContainer) return;

		const { top, left, width, height } = this.getBoundingClientRect();
		const { width: dropdownWidth, height: dropdownHeight } = this.#dropdownContainer.getBoundingClientRect();

		Object.assign(this.#dropdownContainer.style, {
			top: top + height + dropdownHeight > window.innerHeight
				? `${top - dropdownHeight}px`
				: `${top + height}px`,
			left: left + dropdownWidth > window.innerWidth
				? `${left + width - dropdownWidth}px`
				: `${left}px`,
			minWidth: `${width}px`
		});
	}

	/** @param {MouseEvent} e */
	#onDocumentMouseDown = e => {
		if (!this._isOpen) return;

		const isInside = e.target.closest(".multi-select-fwl-dropdown") === this.#dropdownContainer
			|| e.target.closest(elementName) === this;

		if (!isInside)
			this._isOpen = false;
	};

	/** @param {KeyboardEvent} e */
	#onDocumentKeyDown = e => {
		if (this._isOpen && e.key === "Escape")
			this._isOpen = false;
	};

	/** @param {any} item */
	#toggleItem(item) {
		const itemValue = this.#getItemValue(item);

		this.value = this.value?.includes(itemValue)
			? this.value.filter(x => x !== itemValue)
			: [...this.value ?? [], itemValue];

		this._internals.setFormValue(JSON.stringify(this.value));
		this.dispatchEvent(new Event("change"));
	}

	#getItemLabel(item) {
		switch (typeof this.labelSelector) {
			case "function":
				return this.labelSelector(item);
			case "string":
				return item[this.labelSelector];
			default:
				return typeof item === "object" ? item["label"] : item;
		}
	}

	#getItemValue(item) {
		switch (typeof this.valueSelector) {
			case "function":
				return this.valueSelector(item);
			case "string":
				return item[this.valueSelector];
			default:
				return typeof item === "object" ? item["value"] : item;
		}
	}

	createRenderRoot() {
		return this;
	}
}

if (!customElements.get(elementName)) {
	customElements.define(elementName, MultiSelect);
}
