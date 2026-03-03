import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { fromHook, fromObject, join, SetSignal, Signal } from "../../module/utils/signal.mjs";

describe("join()", () => {
	it("should call the callback when any child value changes", () => {
		const subscription = mock.fn((_a, _b) => {});

		const childSignal1 = new Signal(10);
		const childSignal2 = new Signal(20);

		const unsubscribe = join(subscription, childSignal1, childSignal2);

		childSignal1.value = 11;

		childSignal2.value = 21;

		assert.deepEqual(subscription.mock.calls.map(c => c.arguments), [
			[11, 20],
			[11, 21]
		]);

		unsubscribe();
	});

	it("should unsubscribe from children when joined Signal is unsubscribed", () => {
		const childSignal = new Signal(undefined);

		const childSubscribeMock = mock.fn(() => {});
		const childUnsubscribeMock = mock.fn(() => {});

		// @ts-ignore
		childSignal.subscribe = childSubscribeMock;

		// @ts-ignore
		childSignal.unsubscribe = childUnsubscribeMock;

		const unsubscribe = join((_) => {}, childSignal);

		assert.equal(childSubscribeMock.mock.callCount(), 1);
		assert.equal(childUnsubscribeMock.mock.callCount(), 0);
		childSubscribeMock.mock.resetCalls();

		unsubscribe();

		assert.equal(childSubscribeMock.mock.callCount(), 0);
		assert.equal(childUnsubscribeMock.mock.callCount(), 1);
	});
});

describe("fromHook()", () => {
	const hooksOnMock = mock.fn((_name, _callback) => {});
	const hooksOffMock = mock.fn((_name, _callback) => {});

	before(() => {
		// @ts-ignore
		globalThis.Hooks = { on: hooksOnMock, off: hooksOffMock };
	});

	after(() => {
		// @ts-ignore
		delete globalThis.Hooks;
	});

	afterEach(() => {
		hooksOnMock.mock.resetCalls();
		hooksOffMock.mock.resetCalls();
	});

	it("should notify subscribers when the hook is triggered", () => {
		const subscription = mock.fn((_) => {});

		const signal = fromHook("test");
		signal.subscribe(subscription);

		// Grab the callback from the mock fn and manually call it
		const callback = hooksOnMock.mock.calls[0].arguments[1];
		callback(123, 456); // Foundry allows multiple args per hook, which are put in an array in the Signal

		assert.equal(subscription.mock.callCount(), 1);
		assert.deepEqual(subscription.mock.calls[0].arguments[0], [123, 456]);

		signal.unsubscribe(subscription);
	});

	it("should remove the hook when unsubscribed", () => {
		const subscription = mock.fn((_) => {});

		const signal = fromHook("test");
		signal.subscribe(subscription);

		assert.equal(hooksOnMock.mock.callCount(), 1);
		assert.equal(hooksOnMock.mock.calls[0].arguments[0], "test"); // ensure the correct thing was hooked

		signal.unsubscribe(subscription);

		assert.equal(hooksOffMock.mock.callCount(), 1);
		assert.equal(hooksOffMock.mock.calls[0].arguments[0], "test"); // ensure the correct thing was un-hooked
		assert.equal(hooksOffMock.mock.calls[0].arguments[1], hooksOnMock.mock.calls[0].arguments[1]); // ensure the same callback was passed
	});
});

describe("fromObject()", () => {
	/** @type {import("../../module/utils/signal.mjs").DeepSignal<{ text: string; number: number; boolean: boolean; object: { nested1: string; nested2: string; }; array: number[]; aNull: null }>} */
	let objectSignal$;
	beforeEach(() => {
		objectSignal$ = fromObject({
			text: "hello world",
			number: 123,
			boolean: 1 > 0, // for some reason using `true` here causes a type error as it types it as true instead of boolean
			object: {
				nested1: "foo",
				nested2: "bar"
			},
			array: [1, 2, 3],
			aNull: null
		});
	});

	afterEach(() => {
		[objectSignal$, objectSignal$.text$, objectSignal$.number$, objectSignal$.boolean$, objectSignal$.object$, objectSignal$.object$.nested1$, objectSignal$.object$.nested2$, objectSignal$.array$, objectSignal$.aNull$].forEach(s => s.unsubscribeAll());
	});

	it("should construct Signal graph correctly", () => {
		assert.deepEqual(objectSignal$.text$.value, "hello world");
		assert.deepEqual(objectSignal$.number$.value, 123);
		assert.deepEqual(objectSignal$.boolean$.value, true);
		assert.deepEqual(objectSignal$.object$.value, { nested1: "foo", nested2: "bar" });
		assert.deepEqual(objectSignal$.object$.nested1$.value, "foo");
		assert.deepEqual(objectSignal$.object$.nested2$.value, "bar");
		assert.deepEqual(objectSignal$.array$.value, [1, 2, 3]);
		assert.deepEqual(objectSignal$.aNull$.value, null);
	});

	it("should correctly update the value when setting the value on the ObjectSignal", () => {
		// @ts-ignore
		objectSignal$.value = { number: 234, text: "goodbye world", object: { nested2: "baz" } };

		assert.deepEqual(objectSignal$.value, {
			text: "goodbye world",
			number: 234,
			boolean: true,
			object: {
				nested1: "foo",
				nested2: "baz"
			},
			array: [1, 2, 3],
			aNull: null
		});
	});

	it("should correctly track the overall value when setting the value on a child Signal", () => {
		objectSignal$.number$.value = 345;
		objectSignal$.object$.nested1$.value = "buzz";
		objectSignal$.array$.value = [4, 5, 6];

		assert.deepEqual(objectSignal$.value, {
			text: "hello world",
			number: 345,
			boolean: true,
			object: {
				nested1: "buzz",
				nested2: "bar"
			},
			array: [4, 5, 6],
			aNull: null
		});
	});

	it("should notify subscribers when setting the value on the ObjectSignal", () => {
		const subscription = mock.fn();
		const changedChildSubscription = mock.fn();
		const unchangedChildSubscription = mock.fn();

		objectSignal$.subscribe(subscription);
		objectSignal$.number$.subscribe(changedChildSubscription);
		objectSignal$.boolean$.subscribe(unchangedChildSubscription);

		// @ts-ignore
		objectSignal$.value = { number: 234, text: "goodbye world" };

		assert.equal(subscription.mock.callCount(), 1);
		assert.equal(changedChildSubscription.mock.callCount(), 1);
		assert.equal(unchangedChildSubscription.mock.callCount(), 0);
	});

	it("should notify ObjectSignal's subscribers when changing a child value of the ObjectSignal", () => {
		const subscription = mock.fn();

		objectSignal$.subscribe(subscription);

		objectSignal$.number$.value = 10;

		assert.equal(subscription.mock.callCount(), 1);
	});

	it("should notify ObjectSignal's subscribers when changing a nested child value of the ObjectSignal", () => {
		const subscription = mock.fn();

		objectSignal$.subscribe(subscription);

		objectSignal$.object$.nested1$.value = "fizz";

		assert.equal(subscription.mock.callCount(), 1);
	});

	it("should unsubscribe from child Signals when ObjectSignal is unsubscribed from", () => {
		const childSubscribeMock = mock.fn(() => {});
		const childUnsubscribeMock = mock.fn(() => {});

		// @ts-ignore
		objectSignal$.text$.subscribe = childSubscribeMock;

		// @ts-ignore
		objectSignal$.text$.unsubscribe = childUnsubscribeMock;

		const subscription = () => {};

		objectSignal$.subscribe(subscription);

		assert.equal(childSubscribeMock.mock.callCount(), 1);
		assert.equal(childUnsubscribeMock.mock.callCount(), 0);
		childSubscribeMock.mock.resetCalls();

		objectSignal$.unsubscribe(subscription);

		assert.equal(childSubscribeMock.mock.callCount(), 0);
		assert.equal(childUnsubscribeMock.mock.callCount(), 1);
	});
});

describe("SetSignal", () => {
	/** @type {SetSignal<any> | undefined} */
	let set;

	describe("value", () => {
		it("when given a new value that is identical, should not notify any subscribers", () => {
			set = new SetSignal([1, 2, 3]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.value = [1, 2, 3];

			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("when given a new value that adds items, should notify change and add subscribers", () => {
			set = new SetSignal([1, 2, 3]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.value = [1, 2, 3, 4, 5];

			assert.deepEqual([...change.mock.calls[0].arguments[0]], [1, 2, 3, 4, 5]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], [4, 5]);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("when given a new value that removes items, should notify change and remove subscribers", () => {
			set = new SetSignal([1, 2, 3]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.value = [1, 3];

			assert.deepEqual([...change.mock.calls[0].arguments[0]], [1, 3]);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], [2]);
		});

		it("when given a new value that adds and removes items, should notify all subscribers", () => {
			set = new SetSignal([1, 2, 3]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.value = [4, 5];

			assert.deepEqual([...change.mock.calls[0].arguments[0]], [4, 5]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], [4, 5]);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], [1, 2, 3]);
		});
	});

	describe("add()", () => {
		it("one value, when the value does not exist in the set, should notify change and add subscribers", () => {
			set = new SetSignal(["foo"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("bar");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["foo", "bar"]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], ["bar"]);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("one value, when the value already exists in the set, should not notify any subscribers", () => {
			set = new SetSignal(["hello", "world"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("world");

			assert.equal(result, false);
			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("multiple values, when no values exist in the set, should notify change and add subscribers", () => {
			set = new SetSignal(["foo"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("bar", "buzz");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["foo", "bar", "buzz"]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], ["bar", "buzz"]);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("multiple values, when some values exist in the set, should notify change and add subscribers", () => {
			set = new SetSignal(["foo", "bar"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.add("bar", "buzz");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["foo", "bar", "buzz"]);
			assert.deepEqual([...add.mock.calls[0].arguments[0]], ["buzz"]);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("multiple values, when all values already exist in the set, should not notify any subscribers", () => {
			set = new SetSignal(["hello", "world"]);
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
			set = new SetSignal([1, 2]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete(3);

			assert.equal(result, false);
			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("one value, when the value already exists in the set, should notify change and remove subscribers", () => {
			set = new SetSignal(["a", "b"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete("a");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["b"]);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], ["a"]);
		});

		it("multiple values, when no values exist in the set, should not notify any subscribers", () => {
			set = new SetSignal([1, 2]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete(3);

			assert.equal(result, false);
			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		});

		it("multiple values, when some values already exists in the set, should notify change and remove subscribers", () => {
			set = new SetSignal(["a", "b", "c"]);
			const { change, add, remove } = subscribeMockCallbacks();
			const result = set.delete("b", "d");

			assert.equal(result, true);
			assert.deepEqual([...change.mock.calls[0].arguments[0]], ["a", "c"]);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], ["b"]);
		});

		it("multiple values, when all values already exists in the set, should notify change and remove subscribers", () => {
			set = new SetSignal(["a", "b", "c", "d"]);
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
			set = new SetSignal(["a", "b", "c"]);
			const { change, add, remove } = subscribeMockCallbacks();
			set.clear();

			assert.deepEqual([...change.mock.calls[0].arguments[0]], []);
			assert.equal(add.mock.callCount(), 0);
			assert.deepEqual([...remove.mock.calls[0].arguments[0]], ["a", "b", "c"]);
		});

		it("when the set does not contain items, should not notify any subscribers", () => {
			set = new SetSignal();
			const { change, add, remove } = subscribeMockCallbacks();
			set.clear();

			assert.equal(change.mock.callCount(), 0);
			assert.equal(add.mock.callCount(), 0);
			assert.equal(remove.mock.callCount(), 0);
		})
	});

	it("should behave as expected in a joined signal", () => {
		const stringSet = new SetSignal(["a", "b", "c"]);
		const numberSet = new SetSignal([1, 2]);

		const callback = mock.fn();

		const unsubscribe = join(callback, stringSet, numberSet);

		stringSet.add("d");
		numberSet.delete(2);
		stringSet.value = ["hello", "world"];
		numberSet.delete(2);

		assert.equal(callback.mock.callCount(), 3);
		const callArguments = callback.mock.calls.map(c => c.arguments.map(a => [...a]));
		assert.deepEqual(callArguments[0], [["a", "b", "c", "d"], [1, 2]]);
		assert.deepEqual(callArguments[1], [["a", "b", "c", "d"], [1]]);
		assert.deepEqual(callArguments[2], [["hello", "world"], [1]]);

		unsubscribe();
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
