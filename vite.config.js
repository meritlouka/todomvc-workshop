import { defineConfig } from "vite-plus";
import { createApiHandler } from "./server/api.js";
import { DB_PATH, openDb } from "./server/db.js";

// Serves the todo API from the dev and preview servers, so one command runs
// the whole app. Tests start their own API against an in-memory database.
const todosApi = () => {
  let handler;
  const mount = (server) => {
    handler ??= createApiHandler(openDb(DB_PATH));
    server.middlewares.use(handler);
  };

  return {
    name: "todos-api",
    apply: () => !process.env.VITEST,
    configureServer: mount,
    configurePreviewServer: mount,
  };
};

export default defineConfig({
  plugins: [todosApi()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
  },
});
