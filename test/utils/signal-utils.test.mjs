import { computed, signal } from "@preact/signals-core";
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { abortableSubscribe, deepSignal } from "../../src/utils/signal-utils.mjs";

describe("deepSignal", () => {
	it("should have a value that matches the input format", () => {
		const sut = deepSignal({ a: 5, b: 10 });
		assert.deepEqual(sut.value, { a: 5, b: 10 });
	});

	it("should have a value that matches the input format (nested object)", () => {
		const sut = deepSignal({ hello: "world", foobar: { foo: true, bar: true } });
		assert.deepEqual(sut.value, { hello: "world", foobar: { foo: true, bar: true } });
	});

	it("should be subscribable", () => {
		const sut = deepSignal({ a: 5, b: 10 });
		const callback = mock.fn();
		sut.subscribe(callback);
		assert.equal(callback.mock.callCount(), 1);
	});

	it("child properties should be subscribable", () => {
		const sut = deepSignal({ a: 5, b: 10 });
		const callback = mock.fn();
		sut.b.subscribe(callback);
		assert.equal(callback.mock.callCount(), 1);
		assert.deepEqual(callback.mock.calls[0].arguments, [10]);
	});

	it("child properties should be subscribable (nested object)", () => {
		const sut = deepSignal({ top: 1, children: { a: 2, b: 3 } });
		const callback = mock.fn();
		sut.children.a.subscribe(callback);
		assert.equal(callback.mock.callCount(), 1);
		assert.deepEqual(callback.mock.calls[0].arguments, [2]);
	});

	it("when setting value, it should set (patch) the underlying signals", () => {
		const sut = deepSignal({ a: 1, b: 2, c: 3 });
		// @ts-ignore
		sut.value = { b: 20, c: 30 };
		assert.deepEqual(sut.value, { a: 1, b: 20, c: 30 });
		assert.equal(sut.a.value, 1);
		assert.equal(sut.b.value, 20);
		assert.equal(sut.c.value, 30);
	});

	it("when setting value, it should set (patch) the underlying signals (nested object)", () => {
		const sut = deepSignal({ top: 1, children: { a: 2, b: 3 } });
		// @ts-ignore
		sut.value = { children: { b: 10 } };
		assert.deepEqual(sut.value, { top: 1, children: { a: 2, b: 10 } });
		assert.equal(sut.top.value, 1);
		assert.equal(sut.children.a.value, 2);
		assert.equal(sut.children.b.value, 10);
	});

	it("when setting multiple properties via value of multiple, it should only trigger one change", () => {
		const sut = deepSignal({ a: 1, b: 2, c: 3 });
		const callback = mock.fn();
		sut.subscribe(callback);
		callback.mock.resetCalls();

		sut.value = { a: 10, b: 20, c: 30 };
		assert.equal(callback.mock.callCount(), 1);
		assert.deepEqual(callback.mock.calls[0].arguments, [{ a: 10, b: 20, c: 30 }]);
	});

	it("using `value` in a computed signal should work as expected", () => {
		const sut = deepSignal({ a: 2, b: 10 });
		const sum = computed(() => sut.value.a + sut.value.b);
		assert.equal(sum.value, 12);

		// @ts-ignore
		sut.value = { a: 5 };
		assert.equal(sum.value, 15);

		sut.b.value = 15;
		assert.equal(sum.value, 20);
	});
});

describe("abortableSubscribe", () => {
	it("should subscribe to the signal", () => {
		const sig = signal(1);
		const callback = mock.fn();
		const abortController = new AbortController();

		abortableSubscribe(sig, callback, abortController.signal);
		sig.value = 5;

		assert.equal(callback.mock.callCount(), 2);
		assert.deepEqual(callback.mock.calls[0].arguments, [1]);
		assert.deepEqual(callback.mock.calls[1].arguments, [5]);
	});

	it("should unsubscribe when returned cleanup function is called", () => {
		const sig = signal(100);
		const callback = mock.fn();
		const abortController = new AbortController();

		const cleanup = abortableSubscribe(sig, callback, abortController.signal);
		callback.mock.resetCalls();

		cleanup();

		sig.value = 200;

		assert.equal(callback.mock.callCount(), 0);
	});

	it("should unsubscribe when abort signal is aborted", () => {
		const sig = signal("a");
		const callback = mock.fn();
		const abortController = new AbortController();

		abortableSubscribe(sig, callback, abortController.signal);
		callback.mock.resetCalls();

		abortController.abort();

		sig.value = "b";

		assert.equal(callback.mock.callCount(), 0);
	});
});
