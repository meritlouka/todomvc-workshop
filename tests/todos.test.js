import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createApiHandler } from "../server/api.js";
import { openDb } from "../server/db.js";
import Controller from "../src/controller.js";
import Model from "../src/model.js";
import Store from "../src/store.js";
import Template from "../src/template.js";
import View from "../src/view.js";

const realFetch = globalThis.fetch;

let db;
let server;
let store;
let model;

const openStore = (onLoad) =>
  new Promise((resolve) => {
    const opened = new Store("test-todos", (todos) => {
      if (onLoad) onLoad(todos);
      resolve(opened);
    });
  });

const createTodo = (title, target = model) =>
  new Promise((resolve) => target.create(title, ([todo]) => resolve(todo)));

const readAll = (target = model) => {
  const onRead = vi.fn();
  target.read(onRead);
  return onRead.mock.calls[0][0];
};

// Every test gets its own API on a random port, backed by an in-memory database.
beforeEach(async () => {
  db = openDb(":memory:");
  const handler = createApiHandler(db);
  server = createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  vi.stubGlobal("fetch", (url, init) => realFetch(new URL(url, base), init));

  store = await openStore();
  model = new Model(store);
});

afterEach(async () => {
  await store.whenSaved();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

describe("existing todo behavior", () => {
  it("starts with an empty list", () => {
    expect(readAll()).toEqual([]);
  });

  it("creates trimmed titles, incomplete status, and distinct numeric IDs", async () => {
    await createTodo("  First task  ");
    await createTodo("Second task");
    const [first, second] = readAll();
    expect(first).toEqual({ id: expect.any(Number), title: "First task", completed: false });
    expect(second).toEqual({ id: expect.any(Number), title: "Second task", completed: false });
    expect(first.id).not.toBe(second.id);
  });

  it("edits and completes the requested item without changing its neighbor", async () => {
    const { id } = await createTodo("First");
    await createTodo("Second");
    model.update(id, { title: "Updated", completed: true });
    expect(readAll()).toEqual([
      { id, title: "Updated", completed: true },
      { id: expect.any(Number), title: "Second", completed: false },
    ]);
  });

  it("filters completed items and counts all items correctly", async () => {
    const { id } = await createTodo("Done");
    await createTodo("Still working");
    model.update(id, { completed: true });
    const onRead = vi.fn();
    model.read({ completed: true }, onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([{ id, title: "Done", completed: true }]);
    const onCount = vi.fn();
    model.getCount(onCount);
    expect(onCount).toHaveBeenCalledExactlyOnceWith({ active: 1, completed: 1, total: 2 });
  });

  it("deletes only the requested item", async () => {
    const { id } = await createTodo("Remove me");
    await createTodo("Keep me");
    model.remove(id);
    expect(readAll()).toEqual([{ id: expect.any(Number), title: "Keep me", completed: false }]);
  });
});

describe("persistence across reloads", () => {
  const reload = async () => {
    await store.whenSaved();
    return new Model(await openStore());
  };

  it("keeps titles and completed state after a reload", async () => {
    const { id } = await createTodo("Done");
    await createTodo("Still working");
    model.update(id, { completed: true });

    expect(readAll(await reload())).toEqual([
      { id, title: "Done", completed: true },
      { id: expect.any(Number), title: "Still working", completed: false },
    ]);
  });

  it("does not reuse stored IDs for todos created after a reload", async () => {
    await createTodo("First");
    await createTodo("Second");

    const reloaded = await reload();
    await createTodo("Third", reloaded);
    const ids = readAll(reloaded).map((todo) => todo.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps deleted todos gone after a reload", async () => {
    const { id } = await createTodo("Remove me");
    await createTodo("Keep me");
    model.remove(id);

    expect(readAll(await reload())).toEqual([
      { id: expect.any(Number), title: "Keep me", completed: false },
    ]);
  });

  it("saves every change in the SQLite database", async () => {
    const { id } = await createTodo("Buy milk");
    model.update(id, { title: "Buy oat milk", completed: true });
    await store.whenSaved();

    expect(db.list()).toEqual([{ id, title: "Buy oat milk", completed: true }]);
  });
});

describe("server errors", () => {
  it("starts with an empty list when the server is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    const offline = new Model(await openStore());
    expect(readAll(offline)).toEqual([]);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("reloads todos from the server when a save fails", async () => {
    const { id } = await createTodo("Buy milk");
    const onLoad = vi.fn();
    const watched = await openStore(onLoad);
    const watchedModel = new Model(watched);

    vi.spyOn(console, "error").mockImplementation(() => {});
    const passThrough = globalThis.fetch;
    vi.stubGlobal("fetch", (url, init) =>
      init?.method === "PATCH"
        ? Promise.resolve(new Response(null, { status: 500 }))
        : passThrough(url, init),
    );

    watchedModel.update(id, { completed: true });
    expect(readAll(watchedModel)).toEqual([{ id, title: "Buy milk", completed: true }]);

    await watched.whenSaved();
    expect(console.error).toHaveBeenCalledOnce();
    expect(onLoad).toHaveBeenCalledTimes(2);
    expect(readAll(watchedModel)).toEqual([{ id, title: "Buy milk", completed: false }]);
  });
});

describe("edit and delete buttons", () => {
  const rows = () => [...document.querySelectorAll(".todo-list li")];
  const row = (title) => rows().find((li) => li.querySelector("label").textContent === title);
  const titles = () => readAll().map((todo) => todo.title);

  beforeEach(async () => {
    document.documentElement.innerHTML = readFileSync("index.html", "utf8");
    await createTodo("Buy milk");
    await createTodo('Say "hi"');
    new Controller(model, new View(new Template())).setView("");
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
