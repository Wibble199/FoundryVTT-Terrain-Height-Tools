/** @import { Signal } from "@preact/signals-core" */
import { batch, computed, effect, signal } from "@preact/signals-core";

/**
 * @template T
 * @typedef {Signal<T> & { [K in keyof T]: T[K] extends Record<string, {}> ? DeepSignal<T[K]> : Signal<T[K]> }} DeepSignal
 */
/**
 * Creates a deeply-reactive signal from the given object.
 * @template T
 * @param {T} obj
 * @returns {DeepSignal<T>}
 */
export function deepSignal(obj) {
	if (typeof obj !== "object" || Array.isArray(obj) || obj === null) {
		return signal(obj);
	}

	const signalObj = Object.fromEntries(
		Object.entries(obj).map(([k, v]) => [k, deepSignal(v)])
	);

	const computedValue = computed(() => Object.fromEntries(
		Object.entries(signalObj).map(([k, s]) => [k, s.value])
	));

	return new Proxy({}, {
		get(_, prop) {
			if (prop in computedValue) return computedValue[prop];
			return signalObj[prop];
		},
		set(_, prop, value) {
			if (prop !== "value") throw new TypeError(`Cannot set property "${prop}" on a deepSignal`);
			batch(() => {
				for (const [k, v] of Object.entries(value)) {
					if (signalObj[k]) signalObj[k].value = v;
				}
			});
			return true;
		}
	});
}

/**
 * Similar to Preact Signal's `signal().subscribe` method, but allows for unsubscribing when an AbortSignal aborts.
 * @template T
 * @param {Signal<T>} signal
 * @param {(value: T) => void} fn
 * @param {AbortSignal} abortSignal
 * @returns A cleanup function for both unsubscribing to the signal and cleaning up the AbortSignal
 */
export function abortableSubscribe(signal, fn, abortSignal) {
	// If signal is already aborted, do nothing
	if (abortSignal.aborted) return () => {};

	const unsubscribe = signal.subscribe(fn);

	let hasUnsubscribed = false;
	const unsubscribeIfRequired = () => {
		if (hasUnsubscribed) return;
		hasUnsubscribed = true;
		unsubscribe();
	};

	abortSignal.addEventListener("abort", unsubscribeIfRequired, { once: true });

	return () => {
		abortSignal.removeEventListener("abort", unsubscribeIfRequired);
		unsubscribeIfRequired();
	};
}

/**
 * Similar to Preact Signal's `effect()` method, but allows for unsubscribing when an AbortSignal aborts.
 * @param {() => void} fn
 * @param {AbortSignal} abortSignal
 * @returns A cleanup function for both cleaning up the effect and cleaning up the AbortSignal
 */
export function abortableEffect(fn, abortSignal) {
	// If signal is already aborted, do nothing
	if (abortSignal.aborted) return () => {};

	const cleanup = effect(fn);

	let hasCleanedUp = false;
	const cleanupIfRequired = () => {
		if (hasCleanedUp) return;
		hasCleanedUp = true;
		cleanup();
	};

	abortSignal.addEventListener("abort", cleanupIfRequired, { once: true });

	return () => {
		abortSignal.removeEventListener("abort", cleanupIfRequired);
		cleanupIfRequired();
	};
}
