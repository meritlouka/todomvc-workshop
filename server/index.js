import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { createApiHandler } from "./api.js";
import { DB_PATH, openDb } from "./db.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 3000;
const DIST = resolve("dist");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const notFound = (res) => {
  res.statusCode = 404;
  res.end("Not found");
};

const serveStatic = (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return notFound(res);

  let file;
  try {
    file = resolve(DIST, `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`);
  } catch {
    return notFound(res);
  }

  // Never serve anything outside dist/, whatever the URL says.
  if (file !== DIST && !file.startsWith(DIST + sep)) return notFound(res);

  const stats = statSync(file, { throwIfNoEntry: false });
  if (stats?.isDirectory()) file = join(file, "index.html");
  else if (!stats) return notFound(res);

  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return notFound(res);

  res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
  if (req.method === "HEAD") return res.end();

  createReadStream(file).pipe(res);
};

const api = createApiHandler(openDb(DB_PATH));

createServer((req, res) => api(req, res, () => serveStatic(req, res))).listen(PORT, HOST, () => {
  console.log(`Todos on http://${HOST}:${PORT} (database: ${DB_PATH})`);
});
