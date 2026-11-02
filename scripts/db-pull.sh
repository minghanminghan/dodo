#!/usr/bin/env bash
# Replaces the local dev DB and files with a fresh snapshot of prod: pnpm db:pull
# Prod is never written. The old local DB is kept as <db>.bak. Stop `pnpm dev` first.
set -euo pipefail

HOST=${DODO_HOST:-root@andrewsserver}
DB=${DODO_DB:-$HOME/.dodo/dodo.db}
FILES=${DODO_FILES:-$(dirname "$DB")/files}

die() { echo "error: $*" >&2; exit 1; }

if lsof "$DB" >/dev/null 2>&1; then die "$DB is open (pnpm dev?). Stop it first."; fi
mkdir -p "$(dirname "$DB")" "$FILES"

tmp=$DB.pull
ssh "$HOST" 'f=$(mktemp) && sqlite3 /var/lib/dodo/dodo.db ".backup $f" && cat "$f"; rm -f "$f"' >"$tmp"
[[ $(sqlite3 "$tmp" 'PRAGMA integrity_check') == ok ]] || { rm -f "$tmp"*; die "snapshot failed the integrity check"; }
count=$(sqlite3 "$tmp" 'SELECT count(*) FROM docs WHERE deleted_at IS NULL')
rm -f "$tmp-wal" "$tmp-shm"

if [[ -e $DB ]]; then sqlite3 "$DB" ".backup '$DB.bak'"; fi
rm -f "$DB" "$DB-wal" "$DB-shm"
mv "$tmp" "$DB"
rsync -a --delete "$HOST:/var/lib/dodo/files/" "$FILES/"

echo "pulled $count docs into $DB"
