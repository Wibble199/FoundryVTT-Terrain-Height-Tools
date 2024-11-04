import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { fromHook, fromObject, join, Signal } from "../../module/utils/signal.mjs";

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
