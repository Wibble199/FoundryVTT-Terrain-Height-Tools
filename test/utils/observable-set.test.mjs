import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { ObservableSet } from "../../src/utils/observable-set.mjs";

describe("ObservableSet", () => {
	/** @type {ObservableSet<any> | undefined} */
	let set;

	describe("value", () => {
		it("when given a new value that is identical, should not notify any subscribers", () => {
			set = new ObservableSet([1, 2, 3]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.value = [1, 2, 3];

			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("when given a new value that adds items, should notify change and add subscribers", () => {
			set = new ObservableSet([1, 2, 3]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.value = [1, 2, 3, 4, 5];

			assert.deepEqual([...change.mock.calls[0].arguments[0]], [1, 2, 3, 4, 5]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], [4, 5]);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("when given a new value that removes items, should notify change and remove subscribers", () => {
			set = new ObservableSet([1, 2, 3]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.value = [1, 3];

			assert.deepEqual([...change.mock.calls[0].arguments[0]], [1, 3]);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], [2]);
		});

		it("when given a new value that adds and removes items, should notify all subscribers", () => {
			set = new ObservableSet([1, 2, 3]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.value = [4, 5];

			assert.deepEqual([...change.mock.calls[0].arguments[0]], [4, 5]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], [4, 5]);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], [1, 2, 3]);
		});
	});

	describe("add()", () => {
		it("one value, when the value does not exist in the set, should notify change and add subscribers", () => {
			set = new ObservableSet(["foo"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("bar");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["foo", "bar"]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], ["bar"]);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("one value, when the value already exists in the set, should not notify any subscribers", () => {
			set = new ObservableSet(["hello", "world"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("world");

			assert.equal(result, false);
			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("multiple values, when no values exist in the set, should notify change and add subscribers", () => {
			set = new ObservableSet(["foo"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("bar", "buzz");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["foo", "bar", "buzz"]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], ["bar", "buzz"]);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("multiple values, when some values exist in the set, should notify change and add subscribers", () => {
			set = new ObservableSet(["foo", "bar"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("bar", "buzz");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["foo", "bar", "buzz"]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], ["buzz"]);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("multiple values, when all values already exist in the set, should not notify any subscribers", () => {
			set = new ObservableSet(["hello", "world"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("hello", "world");

			assert.equal(result, false);
			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});
	});

	describe("delete()", () => {
		it("one value, when the value does not exist in the set, should not notify any subscribers", () => {
			set = new ObservableSet([1, 2]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete(3);

			assert.equal(result, false);
			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("one value, when the value already exists in the set, should notify change and remove subscribers", () => {
			set = new ObservableSet(["a", "b"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete("a");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["b"]);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], ["a"]);
		});

		it("multiple values, when no values exist in the set, should not notify any subscribers", () => {
			set = new ObservableSet([1, 2]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete(3);

			assert.equal(result, false);
			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("multiple values, when some values already exists in the set, should notify change and remove subscribers", () => {
			set = new ObservableSet(["a", "b", "c"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete("b", "d");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["a", "c"]);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], ["b"]);
		});

		it("multiple values, when all values already exists in the set, should notify change and remove subscribers", () => {
			set = new ObservableSet(["a", "b", "c", "d"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete("c", "d");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["a", "b"]);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], ["c", "d"]);
		});
	});

	describe("clear()", () => {
		it("when the set contains items, should empty the set and notify the change and remove subscribers", () => {
			set = new ObservableSet(["a", "b", "c"]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.clear();

			assert.deepEqual([...change.mock.calls[0].arguments[0]], []);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], ["a", "b", "c"]);
		});

		it("when the set does not contain items, should not notify any subscribers", () => {
			set = new ObservableSet();
			const { change, add, remove } = subscribeMockCallbacks();
			set.clear();

			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		})
	});

	describe("subscribe()", () => {
		it("when passed an AbortSignal, should unsubscribe when the abort signal is triggered", () => {
			set = new ObservableSet([1, 2]);

			const abortController = new AbortController();
			const observer = { change: mock.fn() };
			set.subscribe(observer, { signal: abortController.signal });

			set.add(5);
			assert.equal(observer.change.mock.callCount(), 1);
			observer.change.mock.resetCalls();

			abortController.abort();

			set.add(10);
			assert.equal(observer.change.mock.callCount(), 0);
		})
	});

	afterEach(() => {
		set?.unsubscribeAll();
	});

	function subscribeMockCallbacks() {
		const callbackObj = {
			change: mock.fn(),
			add: mock.fn(),
			remove: mock.fn()
		};
		set?.subscribe(callbackObj);
		return callbackObj;
	}
});
