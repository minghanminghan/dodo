export const AGENTS_MD = `# AGENTS.md

## Docs live in dodo

\`dodo\` is a store of markdown docs: how projects are set up, deployed and run.
Docs live on a dodo server (SQLite behind a Next.js app); the \`dodo\` CLI talks
to it over HTTP. Read dodo before you copy a pattern from another repo, and
write what you learn back to it.

## Paths and projects

- A doc's path is its place in the tree, like \`deploy/mini-pc\` or
  \`conventions/commits\`. Paths are lowercase \`a-z 0-9 . _ -\`, 1-8 segments.
  Input is lowercased, and leading/trailing \`/\` and a trailing \`.md\` are dropped.
- A doc has zero or more project keys (\`SPAR\`, \`CROW\`, ...). They are labels
  for filtering, not folders. \`dodo project <path> --set SPAR,CROW\` sets them.
- \`dodo list [--project K] [--under PATH]\` lists docs. \`dodo search <query>\`
  finds docs by path, title or body text.

## Editing a doc: read and replace

1. \`dodo show <path> --json\` — note \`bodyHash\`, save \`body\` to a temp file.
2. Edit the temp file with your normal file tools.
3. \`dodo write <path> --body-hash <bodyHash> --body-file <tmp>\`.
4. On exit code 3 someone changed the doc first: run \`dodo show\` again and redo
   the edit on the new body.

New docs: \`dodo create <path> [--project K]... --body-file <file>\` (or \`--body -\`
for stdin). Other commands: \`dodo move <from> <to>\`, \`dodo delete <path>\`,
\`dodo attach <path> <file>\` (prints markdown to paste into the doc).

## Connecting

\`--env prod\` uses the prod server and \`--env dev\` the local \`pnpm dev\` server.
Without \`--env\`, the CLI uses \`DODO_URL\`, else the prod server. On exit code 5
run \`dodo upgrade\`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | ok |
| 1 | usage error |
| 2 | not found |
| 3 | conflict (stale \`--body-hash\`, or the path is taken) |
| 4 | invalid (e.g. a file over 25 MB) |
| 5 | version mismatch with the server (run \`dodo upgrade\`) |
| 6 | server unreachable (check \`DODO_URL\` / \`--env\`) |

Output is JSON when stdout is not a terminal. Errors are JSON on stderr:
\`{ "error": { "code", "message" } }\`. Run \`dodo help --json\` for every
command and flag.
`
