import { html } from "lit";

const noGroup = Symbol("noGroup");

/**
 * @template TOptions
 * @template {TOptions extends Array<infer T0> ? T0 : TOptions extends { [k: string]: infer T1 } ? [string, T1] : never} TOption
 * Generates an array of template results based on the given options.
 * @param {TOptions} options The options to display.
 * - If given an array, by default looks for 'label', 'value' and 'group' properties on each array element.
 * - If given an object, by default uses the keys as the option value and the object values as the display strings.
 * @param {Object} [opt]
 * @param {any} [opt.selected] The value of the selected option.
 * @param {keyof TOption | ((o: TOption) => any)} [opt.labelSelector] Property name or function to get the option's label.
 * @param {keyof TOption | ((o: TOption) => any)} [opt.valueSelector] Property name or function to get the option's value.
 * @param {keyof TOption | ((o: TOption) => any)} [opt.groupSelector] Property name or function to get the option's group.
 * @param {boolean} [opt.localize=true] If true, localizes labels. Default true.
 * @param {boolean} [opt.sort=false] If true, sorts options by their label (after localization). Default false.
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
