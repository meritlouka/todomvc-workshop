import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

let Store;
let Model;
let store;
let model;

const openStore = (StoreClass) =>
  new Promise((resolve) => {
    const opened = new StoreClass("test-todos", () => resolve(opened));
  });

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  ({ default: Store } = await import("../src/store.js"));
  ({ default: Model } = await import("../src/model.js"));
  store = await openStore(Store);
  model = new Model(store);
});

describe("existing todo behavior", () => {
  it("starts with an empty list", () => {
    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([]);
  });

  it("creates trimmed titles, incomplete status, and distinct numeric IDs", () => {
    model.create("  First task  ");
    model.create("Second task");
    const onRead = vi.fn();
    model.read(onRead);
    const [first, second] = onRead.mock.calls[0][0];
    expect(first).toEqual({ id: expect.any(Number), title: "First task", completed: false });
    expect(second).toEqual({ id: expect.any(Number), title: "Second task", completed: false });
    expect(first.id).not.toBe(second.id);
  });

  it("edits and completes the requested item without changing its neighbor", () => {
    const onCreate = vi.fn();
    model.create("First", onCreate);
    model.create("Second");
    const id = onCreate.mock.calls[0][0][0].id;
    model.update(id, { title: "Updated", completed: true });
    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead.mock.calls[0][0]).toEqual([
      { id, title: "Updated", completed: true },
      { id: expect.any(Number), title: "Second", completed: false },
    ]);
  });

  it("filters completed items and counts all items correctly", () => {
    const onCreate = vi.fn();
    model.create("Done", onCreate);
    model.create("Still working");
    const id = onCreate.mock.calls[0][0][0].id;
    model.update(id, { completed: true });
    const onRead = vi.fn();
    model.read({ completed: true }, onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([{ id, title: "Done", completed: true }]);
    const onCount = vi.fn();
    model.getCount(onCount);
    expect(onCount).toHaveBeenCalledExactlyOnceWith({ active: 1, completed: 1, total: 2 });
  });

  it("deletes only the requested item", () => {
    const onCreate = vi.fn();
    model.create("Remove me", onCreate);
    model.create("Keep me");
    model.remove(onCreate.mock.calls[0][0][0].id);
    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([
      { id: expect.any(Number), title: "Keep me", completed: false },
    ]);
  });
});

describe("persistence across reloads", () => {
  const reload = async () => {
    vi.resetModules();
    const { default: FreshStore } = await import("../src/store.js");
    const { default: FreshModel } = await import("../src/model.js");
    return new FreshModel(await openStore(FreshStore));
  };

  it("keeps titles and completed state after a reload", async () => {
    const onCreate = vi.fn();
    model.create("Done", onCreate);
    model.create("Still working");
    model.update(onCreate.mock.calls[0][0][0].id, { completed: true });

    const reloaded = await reload();
    const onRead = vi.fn();
    reloaded.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([
      { id: expect.any(Number), title: "Done", completed: true },
      { id: expect.any(Number), title: "Still working", completed: false },
    ]);
  });

  it("does not reuse stored IDs for todos created after a reload", async () => {
    model.create("First");
    model.create("Second");

    const reloaded = await reload();
    reloaded.create("Third");
    const onRead = vi.fn();
    reloaded.read(onRead);
    const ids = onRead.mock.calls[0][0].map((todo) => todo.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps deleted todos gone after a reload", async () => {
    const onCreate = vi.fn();
    model.create("Remove me", onCreate);
    model.create("Keep me");
    model.remove(onCreate.mock.calls[0][0][0].id);

    const reloaded = await reload();
    const onRead = vi.fn();
    reloaded.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([
      { id: expect.any(Number), title: "Keep me", completed: false },
    ]);
  });

  it("still works in memory when IndexedDB is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.indexedDB = undefined;

    const reloaded = await reload();
    reloaded.create("Offline");
    const onRead = vi.fn();
    reloaded.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([{ id: 1, title: "Offline", completed: false }]);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
