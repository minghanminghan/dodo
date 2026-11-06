#!/usr/bin/env bash
# Run as root by `hawk setup dodo`, after it makes $DATA.
set -euo pipefail
install -d -o dodo -g dodo -m 0750 "$DATA/files"
