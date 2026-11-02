#!/usr/bin/env bash
# Deploys a checkout to the mini PC. Run by the release workflow's deploy job as dodo-runner:
#   VERSION=1.2.3 deploy/deploy.sh
# Builds into /opt/dodo/releases/<version>-<run>, backs up and migrates the DB, switches
# /opt/dodo/current, restarts dodo, and checks /api/version. Keeps the newest 3 releases.
# Rollback: sudo ln -sfn <old release> /opt/dodo/current && sudo systemctl restart dodo
# (if a migration changed the DB, first restore a /var/backups/dodo copy with dodo stopped).
set -euo pipefail

OPT=/opt/dodo
SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
: "${VERSION:?set VERSION}"
R=$OPT/releases/$VERSION-${GITHUB_RUN_ID:-$(date +%s)}

step() { echo "==> $*"; }

step "build: $R"
mkdir -p "$R"
git -C "$SRC" archive HEAD | tar -x -C "$R"
cd "$R"
pnpm pkg set version="$VERSION"
pnpm install --frozen-lockfile
pnpm build

step "backup + migrate"
ln -sfn "$R" $OPT/next
sudo systemctl start dodo-predeploy

step "switch + restart"
ln -sfn "$R" $OPT/current
sudo systemctl restart dodo

step "health check"
port=$(systemctl show -P Environment dodo | tr ' ' '\n' | sed -n 's/^PORT=//p')
for _ in $(seq 1 30); do
  got=$(curl -fsS "http://127.0.0.1:$port/api/version" 2>/dev/null | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version' 2>/dev/null || true)
  [[ $got == "$VERSION" ]] && break
  sleep 1
done
[[ $got == "$VERSION" ]] || { echo "error: /api/version is '$got', expected $VERSION. See journalctl -u dodo" >&2; exit 1; }

step "prune releases"
cd $OPT/releases
ls -1t | tail -n +4 | while read -r old; do
  [[ $OPT/releases/$old == "$(readlink -f $OPT/current)" ]] || rm -rf "$old"
done
echo "deployed $VERSION"
