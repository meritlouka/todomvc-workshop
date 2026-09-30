import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import Controller from "../src/controller.js";
import Template from "../src/template.js";
import View from "../src/view.js";

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

describe("edit and delete buttons", () => {
  const rows = () => [...document.querySelectorAll(".todo-list li")];
  const row = (title) => rows().find((li) => li.querySelector("label").textContent === title);
  const titles = () => {
    const onRead = vi.fn();
    model.read(onRead);
    return onRead.mock.calls[0][0].map((todo) => todo.title);
  };

  beforeEach(() => {
    document.documentElement.innerHTML = readFileSync("index.html", "utf8");
    const controller = new Controller(model, new View(new Template()));
    controller.setView("");
    controller.addItem("Buy milk");
    controller.addItem('Say "hi"');
  });

  it("shows an Edit and a Delete button on every todo, named after it", () => {
    const names = rows().flatMap((li) =>
      [...li.querySelectorAll(".actions button")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    );
    expect(names).toEqual(['Edit Say "hi"', 'Delete Say "hi"', "Edit Buy milk", "Delete Buy milk"]);
  });

  it("opens the edit field from the Edit button and saves on Enter", () => {
    row("Buy milk").querySelector(".edit-btn").click();

    const li = row("Buy milk");
    const input = li.querySelector("input.edit");
    expect(li.classList).toContain("editing");
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Buy milk");

    input.value = "Buy oat milk";
    input.dispatchEvent(new KeyboardEvent("keypress", { keyCode: 13, bubbles: true }));

    expect(row("Buy oat milk").classList).not.toContain("editing");
    expect(titles()).toEqual(["Buy oat milk", 'Say "hi"']);
  });

  it("removes the todo from the list and the model with the Delete button", () => {
    row("Buy milk").querySelector(".delete-btn").click();

    expect(rows().map((li) => li.querySelector("label").textContent)).toEqual(['Say "hi"']);
    expect(titles()).toEqual(['Say "hi"']);
  });

  it("still starts editing on double-click", () => {
    row("Buy milk")
      .querySelector("label")
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(row("Buy milk").classList).toContain("editing");
  });
});
