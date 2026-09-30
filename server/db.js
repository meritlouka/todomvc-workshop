import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DB_PATH = process.env.TODOS_DB || "data/todos.sqlite";

const toTodo = (row) => row && { id: row.id, title: row.title, completed: row.completed === 1 };
const toFlag = (completed) => (completed === undefined ? null : Number(completed));

/**
 * Opens (and creates, if needed) the SQLite todo database.
 *
 * @param {string} path A file path, or ":memory:" for a throwaway database
 */
export const openDb = (path) => {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL CHECK (length(title) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    )
  `);

  const columns = "id, title, completed";
  const statements = {
    list: db.prepare(`SELECT ${columns} FROM todos ORDER BY id`),
    create: db.prepare(`INSERT INTO todos (title, completed) VALUES (?, ?) RETURNING ${columns}`),
    update: db.prepare(
      `UPDATE todos SET title = coalesce(?, title), completed = coalesce(?, completed)
       WHERE id = ? RETURNING ${columns}`,
    ),
    remove: db.prepare("DELETE FROM todos WHERE id = ?"),
    removeAll: db.prepare("DELETE FROM todos"),
  };

  return {
    list: () => statements.list.all().map(toTodo),
    create: ({ title, completed = false }) =>
      toTodo(statements.create.get(title, Number(completed))),
    update: (id, { title = null, completed }) =>
      toTodo(statements.update.get(title, toFlag(completed), id)),
    remove: (id) => statements.remove.run(id).changes > 0,
    removeAll: () => {
      statements.removeAll.run();
    },
    close: () => db.close(),
  };
};
