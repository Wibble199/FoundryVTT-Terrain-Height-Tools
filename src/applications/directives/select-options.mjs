import { html } from "lit";

const noGroup = Symbol("noGroup");

/**
 * Generates an array of template results based on the given options.
 * @param {Record<string, any> | any[]} options The options to display.
 * @param {Object} [opt]
 * @param {any} [opt.selected] The value of the selected option
 * @param {string | number | ((o: any) => any)} [opt.labelSelector] Property name or function to get the option's label.
 * @param {string | number | ((o: any) => any)} [opt.valueSelector] Property name or function to get the option's value.
 * @param {string | number | ((o: any) => any)} [opt.groupSelector] Property name or function to get the option's group.
 * @param {boolean} [opt.localize=true] If true, localizes labels. Default true.
 * @param {boolean} [opt.sort=false] If true, sorts options by their label (after localization). Default false.
 * @returns
 */
export function selectOptions(options, { selected, labelSelector, valueSelector, groupSelector, localize = true, sort = false } = {}) {
	if (Array.isArray(options)) {
		labelSelector ??= "label";
		valueSelector ??= "value";
		groupSelector ??= "group";
	} else {
		options = Object.entries(options);
		labelSelector ??= 1;
		valueSelector ??= 0;
	}

	const preparedOptions = options.map(option => {
		const label = typeof labelSelector === "function" ? labelSelector(option) : option[labelSelector];
		const value = typeof valueSelector === "function" ? valueSelector(option) : option[valueSelector];
		const group = typeof groupSelector === "function" ? groupSelector(option) : option[groupSelector];
		return { label: localize ? game.i18n.localize(label) : label, value, group, selected: selected === value };
	});

	if (sort) {
		preparedOptions.sort((a, b) => a.label.localeCompare(b.label));
	}

	const groupedOptions = preparedOptions.reduce((byGroup, option) => {
		const group = option.group?.length ? option.group : noGroup;
		byGroup[group] ??= [];
		byGroup[group].push(html`<option value=${option.value} ?selected=${option.selected}>${option.label}</option>`);
		return byGroup;
	}, {});

	return [
		// Place non-grouped items first
		...groupedOptions[noGroup] ?? [],

		// Then place grouped items in an optgroup each
		...Object.entries(groupedOptions)
			.filter(([group]) => group !== noGroup)
			.map(([group, options]) => html`
				<optgroup label=${localize ? game.i18n.localize(group) : group}>
					${options}
				</optgroup>
			`)
	];
}
