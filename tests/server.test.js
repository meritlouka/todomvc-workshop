// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createApiHandler } from "../server/api.js";
import { openDb } from "../server/db.js";

let db;
let server;
let base;

// A string body is sent as-is, anything else as JSON.
const api = (method, path = "", body, headers = { "Content-Type": "application/json" }) => {
  const options = { method };
  if (body !== undefined) {
    options.headers = headers;
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  return fetch(`${base}/api/todos${path}`, options);
};

const create = async (title) => (await api("POST", "", { title })).json();

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
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

describe("todo API", () => {
  it("lists no todos in an empty database", async () => {
    const response = await api("GET");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("creates a todo with a trimmed title, not completed", async () => {
    const response = await api("POST", "", { title: "  Buy milk  " });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 1, title: "Buy milk", completed: false });
    expect(await (await api("GET")).json()).toEqual([
      { id: 1, title: "Buy milk", completed: false },
    ]);
  });

  it("updates the title and completed state", async () => {
    const { id } = await create("Buy milk");

    const response = await api("PATCH", `/${id}`, { completed: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id, title: "Buy milk", completed: true });

    await api("PATCH", `/${id}`, { title: "Buy oat milk" });
    expect(await (await api("GET")).json()).toEqual([
      { id, title: "Buy oat milk", completed: true },
    ]);
  });

  it("deletes one todo, or all of them", async () => {
    const { id } = await create("Remove me");
    await create("Keep me");

    expect((await api("DELETE", `/${id}`)).status).toBe(204);
    expect((await (await api("GET")).json()).map((todo) => todo.title)).toEqual(["Keep me"]);

    expect((await api("DELETE")).status).toBe(204);
    expect(await (await api("GET")).json()).toEqual([]);
  });

  it("answers 404 for unknown todos and paths", async () => {
    expect((await api("PATCH", "/99", { completed: true })).status).toBe(404);
    expect((await api("DELETE", "/99")).status).toBe(404);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    expect((await api("GET", "/abc")).status).toBe(404);
  });

  it.each([
    ["an empty title", { title: "   " }],
    ["a missing title", { completed: false }],
    ["a non-string title", { title: 42 }],
    ["a too long title", { title: "x".repeat(501) }],
    ["a non-boolean completed", { title: "A", completed: "yes" }],
    ["an unknown field", { title: "A", id: 7 }],
    ["an array body", [{ title: "A" }]],
    ["invalid JSON", "{not json"],
  ])("rejects %s with 400", async (_, body) => {
    const response = await api("POST", "", body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it("rejects an update with nothing to change", async () => {
    const { id } = await create("A");
    expect((await api("PATCH", `/${id}`, {})).status).toBe(400);
  });

  it("only accepts JSON bodies, so cross-site forms cannot post", async () => {
    const response = await api("POST", "", "title=A", { "Content-Type": "text/plain" });
    expect(response.status).toBe(415);
    expect(await (await api("GET")).json()).toEqual([]);
  });

  it("rejects bodies over 10 KB", async () => {
    const response = await api("POST", "", { title: "A", padding: "x".repeat(11 * 1024) });
    expect(response.status).toBe(413);
  });

  it("never reuses the ID of a deleted todo", async () => {
    await create("First");
    const { id } = await create("Second");
    await api("DELETE", `/${id}`);

    expect((await create("Third")).id).toBe(id + 1);
  });

  it("stores SQL in a title as plain text", async () => {
    const title = `Say "hi"'); DROP TABLE todos; --`;
    await create(title);

    expect(await (await api("GET")).json()).toEqual([{ id: 1, title, completed: false }]);
  });
});

describe("SQLite file", () => {
  it("keeps todos after the database is closed and opened again", () => {
    const dir = mkdtempSync(join(tmpdir(), "todos-"));
    const path = join(dir, "nested", "todos.sqlite");

    try {
      const first = openDb(path);
      first.create({ title: "Survive a restart" });
      first.close();

      const second = openDb(path);
      expect(second.list()).toEqual([{ id: 1, title: "Survive a restart", completed: false }]);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
