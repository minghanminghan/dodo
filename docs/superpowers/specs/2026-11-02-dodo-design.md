# Dodo: markdown doc storage (DODO-1)

## Why

Andrew runs three services on his mini PC: sparrow (kanban, `~/Desktop/personal/productivity`),
crow (whiteboard, `~/Desktop/personal/whiteboard`) and budgie (newsletter,
`~/Desktop/personal/newsletter`). He built sparrow first, then built crow and budgie by copying its
pattern. The know-how behind that pattern (setup, deploy to the mini PC, CI/CD, semver,
conventional commits, runbooks) is spread across READMEs, `docs/superpowers` specs and script
headers in each repo. Dodo is one place to keep that knowledge as markdown docs, so the next
project starts from docs instead of from a copy of another repo.

Readers and writers:

- **Agents** (Claude Code and similar) read and write docs through a CLI that returns JSON, like
  `sparrow`. Agents write most docs.
- **Andrew** reads, searches and fixes docs in a web UI, on a laptop or a phone.

No multi-user features. Like sparrow, the app is served to the tailnet only and has no login.

## Goals

- Store markdown docs in a directory tree (for example `deploy/mini-pc`, `conventions/commits`).
- A doc has zero, one, or many project keys (for example `SPAR`, `CROW`, `BUDGIE`). They are
  labels for filtering; they do not decide where the doc sits in the tree.
- Docs can hold images and files.
- Full-text search and fuzzy search, both run on the server.
- Edits from the UI and from the CLI. Two edits to the same doc never silently overwrite each other.
- Works on a phone and works offline: read, edit and create docs with no signal (see "Mobile and
  offline").
- Low load on the server: editing and rendering run in the browser.
- Agents in other repos can find dodo: ship a short `CLAUDE.md`/`AGENTS.md` snippet that says how to
  use the CLI, like sparrow's (`productivity/src/core/agents-md.ts`).

## Non-goals

- Running code or runbook steps.
- Deploy infra. A separate service will own that (SPAR-22). Dodo only stores the docs about it.
- Links between services (for example sparrow tasks linking to docs). Not now. Doc URLs should be
  stable so this can come later.
- Version history. Not now.
- Moving the existing docs from sparrow, crow and budgie into dodo. That is a later task; DODO-1
  is the app only.
- Editing docs as local files: no `$EDITOR` flow, no pull/push folder sync.
- A custom-built editor.

## Anti-goals (Claude's guess, not confirmed)

- An agent needs new, unfamiliar tooling to edit a doc. Editing must fit what agents already do:
  run a shell command, edit a local file with normal file tools, run a shell command.
- An edit made offline or by an agent is lost or silently overwritten.
- On the phone, the app waits for the network before it shows a doc.

## Decided

### Stack and hosting

Build it like sparrow: Next.js app, SQLite DB, a CLI bundled with `tsup`, and the same deploy to the
mini PC (systemd unit, predeploy backup + migrate, self-hosted GitHub runner, Caddy on the tailnet).
Use sparrow's repo as the reference for layout, scripts and conventions (`CLAUDE.md`,
`.releaserc.json`, `.github/workflows`, `deploy/`). Sparrow's `CLAUDE.md` development and commit
rules apply here too.

"Reuse sparrow's code" in this doc means copy it into dodo and adapt it. Do not make a shared
package and do not change sparrow. (Claude's call: the code is tied to sparrow's store, task
mentions and outbox shape, so sharing it would be a refactor of sparrow.)

### CLI (for agents): read and replace

- `dodo show <path>` prints the doc (markdown plus metadata, including a body hash), JSON by
  default for agents.
- The agent saves the markdown to a temp file and edits it with its normal file tools.
- `dodo write <path> --body-hash <hash> < file` replaces the whole doc. The server rejects the
  write if the stored hash no longer matches. This is the same check as sparrow's `--body-hash`
  (`productivity/src/core/indexer.ts`, `productivity/src/core/agents-md.ts`).
- Plus the commands needed to list, search, create, move, delete, set project keys, and attach
  files. Follow the shape and naming of `sparrow help --json`.

### UI (for people)

- Editor: CodeMirror 6 with `@codemirror/lang-markdown`. Code blocks are highlighted while typing.
  Load only the languages a doc could reasonably use (bash/shell, python, ts/js, go, json, yaml,
  sql, html/css, plus others the builder thinks are common), and load each one only when it is
  used. This was Claude's pick; Andrew asked for lightweight, markdown rendering and code
  highlighting for the basic languages.
- Rendering: reuse sparrow's `productivity/src/components/Markdown.tsx` (`react-markdown`,
  `remark-gfm`, `rehype-highlight`, `rehype-sanitize`).
- Editing and rendering run in the browser. The server only stores and serves text and files.
- A tree view of the directory structure, a project-key filter, and a search box.

### Search

Full-text and fuzzy search run on the server. SQLite FTS5 is the expected base (the trigram
tokenizer gives substring matches). The builder picks how to add typo tolerance; keep it cheap.

### Files and images

Reuse sparrow's attachment design (`productivity/src/core/attachments.ts`): files on disk in a data
dir, rows in the DB, a 25 MB limit per file. Docs reference them with normal markdown image and
link syntax.

### Mobile and offline

Reuse sparrow's phone work (`productivity/docs/superpowers/specs/2026-10-28-phone-ui-design.md`,
`productivity/public/sw.js`, `productivity/src/client/cache.ts`, `productivity/src/client/outbox.ts`):

- Installable with "Add to Home Screen". The app shell is cached by a service worker.
- All doc text is kept on the device (text is small). Images and files load when opened.
- Shows the cached doc first, then updates in the background when there is a signal.
- Offline, Andrew can edit a doc's text and create new docs. Nothing else works offline: moves,
  renames, deletes, project-key changes and file uploads need a signal, and the UI says so.
  Because of this, outbox items can point at a doc by its path.
- Offline edits and creates wait in an outbox and send when the app is open with a signal.
  Pending items are clearly visible.
- If the doc changed on the server while the edit waited, the server does not overwrite it. The
  queued edit is saved as a conflict copy next to the doc, and Andrew merges it by hand.
- A retried send never makes a duplicate doc or a duplicate conflict copy.

## Left to the builder

- DB schema, path rules (allowed characters, renames, empty folders), and how a project key is
  validated.
- Exact CLI command names and flags, within the sparrow shape.
- The fuzzy search method.
- Where the conflict copy lives and how it is named.
- UI layout on laptop and phone.
- Port and hostname. Suggested: `127.0.0.1:3420` (sparrow 3417, crow 3418, budgie 3419) and
  `https://dodo.andrewminghanjiang.com`.
