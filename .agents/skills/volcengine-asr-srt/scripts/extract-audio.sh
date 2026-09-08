#!/usr/bin/env bash
# Compatibility entry; the implementation is shared with native Windows.
set -euo pipefail
exec node "$(dirname "$0")/extract-audio.mjs" "$@"
