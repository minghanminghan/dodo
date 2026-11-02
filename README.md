# dodo

A store of markdown docs: how projects are set up, deployed and run. Agents read and write docs with the `dodo` CLI. People read, search and edit them in a web UI that works on a phone and offline.

Spec: `docs/superpowers/specs/2026-11-02-dodo-design.md`.

## How it runs

On the mini PC, the same way as sparrow: systemd runs the current release in `/opt/dodo/current`.

- `dodo.service`: the Next.js app on `127.0.0.1:3420` (sparrow 3417, crow 3418, budgie 3419). Caddy serves it to the tailnet only at `https://dodo.andrewminghanjiang.com`, with sparrow's `deploy/caddy/setup.sh`. No login.
- `dodo-predeploy.service`: run by each deploy. It backs up the DB, then migrates it.
- `dodo-backup.timer`: nightly backup into `/var/backups/dodo`, and removes old backups and orphan files.

Data is in `/var/lib/dodo`: the SQLite DB `dodo.db` and uploaded files in `files/`.

Every push to `main` runs the tests. semantic-release tags a version from the conventional commits, and the self-hosted runner on the mini PC deploys it (`deploy/deploy.sh`). Pull requests check the title and run the tests.

## Deploy (mini PC)

You need sparrow already deployed on the mini PC (this uses its Caddy script), and Node 24+ and pnpm installed system-wide.

1. **Push the repo to GitHub** and protect `main`, as for sparrow.
2. **Set up the mini PC.** From a checkout of this repo on the mini PC:

   ```sh
   sudo deploy/setup.sh
   ```

   It is safe to re-run. Run it again after the first deploy (step 4): only then does it add the Caddy site, since sparrow's Caddy script checks that the site answers.
3. **Install the runner** (one time):

   ```sh
   gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token -q .token   # on your laptop
   sudo RUNNER_TOKEN=<token> deploy/runner.sh
   ```

4. **First deploy.** Push to `main`, or re-run the deploy job of the latest release workflow run.
5. **Add the Caddy site:** `sudo deploy/setup.sh` again.
6. Open `https://dodo.andrewminghanjiang.com` from a device on your tailnet. On a phone, use "Add to Home Screen".

Rollback: `sudo ln -sfn /opt/dodo/releases/<old> /opt/dodo/current && sudo systemctl restart dodo`. If a migration changed the DB, first restore a copy from `/var/backups/dodo` with dodo stopped.

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
