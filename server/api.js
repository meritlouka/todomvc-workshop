const MAX_BODY_BYTES = 10 * 1024;
const MAX_TITLE_LENGTH = 500;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const send = (res, status, body) => {
  res.statusCode = status;
  if (body === undefined) return res.end();

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    // Requiring JSON makes cross-site form posts impossible: browsers must
    // preflight this content type, and we never answer a preflight.
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      reject(new HttpError(415, "Content-Type must be application/json"));
      return;
    }

    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Body too large"));
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Invalid JSON"));
      }
    });
    req.on("error", reject);
  });

const parseTodo = (body, { partial }) => {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new HttpError(400, "Expected a JSON object");

  const unknown = Object.keys(body).filter((key) => key !== "title" && key !== "completed");
  if (unknown.length > 0) throw new HttpError(400, `Unknown fields: ${unknown.join(", ")}`);

  const todo = {};

  if (!partial || "title" in body) {
    if (typeof body.title !== "string") throw new HttpError(400, "title must be a string");

    todo.title = body.title.trim();
    if (todo.title.length === 0 || todo.title.length > MAX_TITLE_LENGTH)
      throw new HttpError(400, `title must be 1-${MAX_TITLE_LENGTH} characters`);
  }

  if ("completed" in body) {
    if (typeof body.completed !== "boolean")
      throw new HttpError(400, "completed must be true or false");

    todo.completed = body.completed;
  }

  if (partial && Object.keys(todo).length === 0) throw new HttpError(400, "Nothing to update");

  return todo;
};

const handleCollection = async (db, req, res) => {
  switch (req.method) {
    case "GET":
      return send(res, 200, db.list());
    case "POST":
      return send(res, 201, db.create(parseTodo(await readJson(req), { partial: false })));
    case "DELETE":
      db.removeAll();
      return send(res, 204);
    default:
      throw new HttpError(405, "Method not allowed");
  }
};

const handleItem = async (db, req, res, id) => {
  switch (req.method) {
    case "PATCH": {
      const todo = db.update(id, parseTodo(await readJson(req), { partial: true }));
      if (!todo) throw new HttpError(404, "Todo not found");
      return send(res, 200, todo);
    }
    case "DELETE":
      if (!db.remove(id)) throw new HttpError(404, "Todo not found");
      return send(res, 204);
    default:
      throw new HttpError(405, "Method not allowed");
  }
};

/**
 * Returns a Connect-style middleware that serves the todo API under /api and
 * passes every other request on to `next`.
 *
 * @param {object} db The database from `openDb`
 */
export const createApiHandler = (db) => async (req, res, next) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return next();

  try {
    const match = pathname.match(/^\/api\/todos(?:\/(\d{1,15}))?\/?$/);
    if (!match) throw new HttpError(404, "Not found");

    if (match[1]) await handleItem(db, req, res, Number(match[1]));
    else await handleCollection(db, req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      send(res, error.status, { error: error.message });
    } else {
      console.error(error);
      send(res, 500, { error: "Internal server error" });
    }
  }
};
