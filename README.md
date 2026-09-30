# TodoMVC · AI coding workshop

A small, plain JavaScript app for practicing how to investigate code, write a short spec or plan, implement a change with an agent, and review a pull request.

The starter can add, edit, complete, filter, and delete todos. **Todos are saved on the server in a SQLite file, `data/todos.sqlite`.** Delete that file to start with an empty list. Set `TODOS_DB` to use another file.

## Setup

You need Node.js **26.10.0** (or a newer 26.x release), Git, and a coding assistant you are signed into. Use a GitHub account for your fork and PR.

Fork [snip-ki/todomvc-workshop](https://github.com/snip-ki/todomvc-workshop), clone **your fork**, and run:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. No Docker, environment file, API key, global Vite+ CLI, or database setup is needed.

Before the workshop, add a todo, confirm it disappears on reload, and run `npm run verify`. Check that your agent can read the repo and run commands. If it has browser tools, check that it can open the app too. Wait for the facilitator to hand out the session task.

## Commands

| Command          | Purpose                                          |
|------------------|--------------------------------------------------|
| `npm run dev`    | Start Vite+ and the todo API on port 5173.       |
| `npm start`      | Serve the built app and the API on port 3000.    |
| `npm test`       | Run the baseline tests.                          |
| `npm run verify` | Check formatting and lint, run tests, and build. |
| `npm run format` | Format files.                                    |

Use npm and keep `package-lock.json`. If port 5173 is busy, run `npm run dev -- --port 5174`. The upstream CSS may print a non-blocking placeholder-selector warning during builds.

## Code map

- `src/app.js`: connects the app.
- `src/controller.js`: user actions and rendering.
- `src/model.js`: todo operations and counts.
- `src/store.js`: keeps todos in memory and saves them through the API.
- `src/view.js`, `src/template.js`, `src/helpers.js`: DOM, markup, and events.
- `server/db.js`: the SQLite database (`node:sqlite`).
- `server/api.js`: the `/api/todos` JSON API.
- `server/index.js`: the standalone server behind `npm start`.
- `tests/todos.test.js`: baseline behavior checks.
- `tests/server.test.js`: API and database checks.

## Agent skills

Project skills live in [`.agents/skills/`](.agents/skills/). Use them when the facilitator or your prompt names them (for example decision logging, continuity ledger, planning, or changelog). Session tasks come from the facilitator, not from this repository.

Codex, Pi, and Cursor load `.agents/skills/` directly. Claude Code reads the same folders through per-skill symlinks under [`.claude/skills/`](.claude/skills/). Optional project history lives in [changelog.md](changelog.md) when you use the `agent-changelog` skill.

## Submit your change

1. Create a branch in your fork: `git switch -c workshop/your-name`.
2. Implement the task, inspect the diff, and run `npm run verify`.
3. Commit your changes and push the branch to **your fork**.
4. Open a PR against **[snip-ki/todomvc-workshop](https://github.com/snip-ki/todomvc-workshop)** on branch `main` (base: `main`, head: your fork’s branch).
5. Describe the behavior, tests, and browser checks. Review another pair's PR.

During the workshop, `main` on [snip-ki/todomvc-workshop](https://github.com/snip-ki/todomvc-workshop) stays the shared starting point.

## Attribution

Adapted from [tastejs/todomvc](https://github.com/tastejs/todomvc), `examples/javascript-es6` (imported from upstream `examples/javascript-es6`; see upstream commit history on tastejs/todomvc for provenance). See [LICENSE](LICENSE) for the original notice.

Workshop agent skills under `.agents/skills/` include adapted [pstack](https://github.com/poteto/pstack) `show-me-your-work` and `unslop` (MIT) plus project process skills.
