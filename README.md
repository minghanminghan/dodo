# dodo

A store of markdown docs: how projects are set up, deployed and run. Agents read and write docs with the `dodo` CLI. People read, search and edit them in a web UI that works on a phone and offline.

Spec: `docs/superpowers/specs/2026-11-02-dodo-design.md`.

## How it runs

On the mini PC, deployed by [hawk](https://github.com/minghanminghan/hawk): systemd runs the current release in `/opt/dodo/current`.

- `dodo.service`: the Next.js app on `127.0.0.1:3420` (sparrow 3417, crow 3418, budgie 3419). Caddy serves it to the tailnet only at `https://dodo.andrewminghanjiang.com`. No login.
- `dodo-predeploy.service`: run by each deploy. It backs up the DB, then migrates it.
- `dodo-backup.timer`: nightly backup into `/var/backups/dodo`, and removes old backups and orphan files.

Data is in `/var/lib/dodo`: the SQLite DB `dodo.db` and uploaded files in `files/`.

Every push to `main` runs the tests. hawk's release workflow tags a version from the conventional commits, and the runner on the mini PC deploys it (`hawk deploy dodo`, which runs `deploy/build.sh`). Pull requests check the title and run the tests.

## Deploy (mini PC)

hawk must be installed on the mini PC, with Node 24+ and pnpm system-wide. `apps/dodo.env` in hawk holds the port and health path.

1. **Add the runner** (one time):

   ```sh
   gh api -X POST repos/minghanminghan/dodo/actions/runners/registration-token -q .token   # on your laptop
   sudo hawk runner https://github.com/minghanminghan/dodo <token>
   ```

2. **Set up dodo** from a checkout of this repo: `sudo hawk setup dodo <checkout>`. It is safe to re-run, and also runs `deploy/hawk-setup.sh`.
3. **Deploy.** Push to `main`.
4. Open `https://dodo.andrewminghanjiang.com` from a device on your tailnet. On a phone, use "Add to Home Screen".

Rollback: `sudo hawk rollback dodo [release]`. If a migration changed the DB, first restore a copy from `/var/backups/dodo` with dodo stopped.

## CLI

Install it from the server:

```sh
curl -fsSL https://dodo.andrewminghanjiang.com/cli/dodo.js -o ~/.local/bin/dodo && chmod +x ~/.local/bin/dodo
```

`dodo help` lists the commands. `dodo agents-md` prints a snippet for an agent's `AGENTS.md` / `CLAUDE.md`. `dodo upgrade` fetches the server's version.

## Develop

```sh
pnpm install
pnpm dev          # next dev on the first free port from 3000, DB at ~/.dodo/dodo.db
pnpm test
pnpm typecheck
pnpm build        # next build, then the CLI, migrate and backup bundles in dist/
node dist/cli.js --env dev list
pnpm db:pull      # replace the local DB and files with a copy of prod
```
