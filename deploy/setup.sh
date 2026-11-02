#!/usr/bin/env bash
# One-time (and safe to re-run) mini PC setup for dodo. Run as root from a repo checkout:
#   sudo [PORT=3420] [NODE_BIN=/usr/bin/node] [CADDY_SETUP=<path>] deploy/setup.sh
# Creates the dodo and dodo-runner users and dirs, installs dodo.service on 127.0.0.1:$PORT,
# the nightly dodo-backup.timer and dodo-predeploy.service, lets dodo-runner deploy (see
# deploy/runner.sh), and serves https://dodo.<domain> -> 127.0.0.1:$PORT to the tailnet with
# the shared Caddy script (CADDY_SETUP; added on the first run after a deploy).
set -euo pipefail

UNIT=/etc/systemd/system/dodo.service
DATA=/var/lib/dodo
BACKUPS=/var/backups/dodo
OPT=/opt/dodo
CADDY_SETUP=${CADDY_SETUP:-/opt/sparrow/current/deploy/caddy/setup.sh}
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

die() { echo "error: $*" >&2; exit 1; }
step() { echo "==> $*"; }

[[ $EUID -eq 0 ]] || die "run as root (sudo $0)"
for cmd in systemctl ss tailscale install useradd visudo; do
  command -v "$cmd" >/dev/null || die "$cmd not found"
done
[[ -x $CADDY_SETUP ]] || die "no Caddy script at $CADDY_SETUP (set CADDY_SETUP)"

# Keep the port from a previous run unless PORT is given.
PORT=${PORT:-$(sed -n 's/^Environment=PORT=//p' "$UNIT" 2>/dev/null || true)}
PORT=${PORT:-3420}
NODE_BIN=${NODE_BIN:-$(command -v node || true)}
TARGET=http://127.0.0.1:$PORT

[[ -x $NODE_BIN ]] || die "node not found; set NODE_BIN=/path/to/node"
NODE_BIN=$(readlink -f "$NODE_BIN")
case $NODE_BIN in /home/* | /root/*) die "node at $NODE_BIN is under a home dir; the service runs with ProtectHome. Install node system-wide or set NODE_BIN" ;; esac
[[ $("$NODE_BIN" -p 'process.versions.node.split(".")[0]') -ge 24 ]] || die "node 24+ required ($NODE_BIN is $("$NODE_BIN" --version))"

step "user: dodo"
if ! id -u dodo >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin dodo
fi
runuser -u dodo -- "$NODE_BIN" --version >/dev/null || die "user dodo cannot run $NODE_BIN"

step "user: dodo-runner"
if ! id -u dodo-runner >/dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir /home/dodo-runner --shell /bin/bash dodo-runner
fi
sudoers=$(printf '%s\n' "dodo-runner ALL=(root) NOPASSWD: $(command -v systemctl) start dodo-predeploy, $(command -v systemctl) restart dodo")
if [[ $(cat /etc/sudoers.d/dodo-runner 2>/dev/null) != "$sudoers" ]]; then
  printf '%s\n' "$sudoers" >/etc/sudoers.d/dodo-runner.tmp
  visudo -cqf /etc/sudoers.d/dodo-runner.tmp || die "bad sudoers rule"
  chmod 0440 /etc/sudoers.d/dodo-runner.tmp
  mv /etc/sudoers.d/dodo-runner.tmp /etc/sudoers.d/dodo-runner
fi

step "dirs: $DATA $BACKUPS $OPT/releases"
install -d -o dodo -g dodo -m 0750 "$DATA" "$DATA/files" "$BACKUPS"
install -d -o dodo-runner -g dodo-runner -m 0755 "$OPT" "$OPT/releases"
chown -R dodo-runner:dodo-runner "$OPT/releases"

step "port: 127.0.0.1:$PORT"
pids=$(ss -Hltnp "sport = :$PORT" | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
for pid in $pids; do
  owner=$(ps -o user= -p "$pid" | tr -d ' ')
  [[ $owner == dodo ]] || die "port $PORT is used by pid $pid ($owner). Pick another: PORT=<port> $0"
done
if [[ -z $pids ]] && ss -Hltn "sport = :$PORT" | grep -q .; then
  die "port $PORT is in use. Pick another: PORT=<port> $0"
fi

step "systemd: dodo.service dodo-backup.service dodo-backup.timer dodo-predeploy.service"
changed=()
for unit in dodo.service dodo-backup.service dodo-backup.timer dodo-predeploy.service; do
  rendered=$(sed -e "s|@NODE_BIN@|$NODE_BIN|" -e "s|@PORT@|$PORT|" "$HERE/$unit")
  dest=/etc/systemd/system/$unit
  if [[ ! -f $dest ]] || [[ $(cat "$dest") != "$rendered" ]]; then
    printf '%s\n' "$rendered" >"$dest"
    changed+=("$unit")
  fi
done
[[ ${#changed[@]} -eq 0 ]] || systemctl daemon-reload
systemctl enable dodo >/dev/null
systemctl enable --now dodo-backup.timer >/dev/null
if [[ -e $OPT/current/package.json ]]; then
  if [[ " ${changed[*]} " == *" dodo.service "* ]] || ! systemctl is-active --quiet dodo; then systemctl restart dodo; fi
  systemctl is-active --quiet dodo || echo "warning: dodo did not start; see journalctl -u dodo" >&2
else
  echo "    $OPT/current does not exist yet; the service starts after the first deploy"
fi

# The Caddy script ends with a health check of the site, which fails until a release is running.
if [[ -e $OPT/current/package.json ]]; then
  "$CADDY_SETUP" dodo "127.0.0.1:$PORT"
else
  echo "==> caddy: skipped until the first deploy; then re-run: sudo $0"
fi
URL=https://dodo.${DOMAIN:-andrewminghanjiang.com}

cat <<EOF

Done. dodo will be at $URL (local: $TARGET).

Deploys (CD): install the GitHub runner once, then each release on main deploys itself:
  sudo RUNNER_TOKEN=<token> deploy/runner.sh
  token: gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token -q .token
  First deploy: re-run the deploy job of the latest release workflow run.

Backups run nightly (dodo-backup.timer) into $BACKUPS. Run one now:
  sudo systemctl start dodo-backup && journalctl -u dodo-backup -n 5

Then point the CLI and browser at $URL.
EOF
