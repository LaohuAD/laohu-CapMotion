#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v pnpm >/dev/null 2>&1; then
	echo "error: pnpm 10.5.2 is required" >&2
	exit 1
fi

if [[ ! -d "$repo_root/node_modules/.pnpm" ]]; then
	echo "error: project dependencies are missing" >&2
	echo "run: cd \"$repo_root\" && pnpm install --frozen-lockfile" >&2
	exit 1
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
	if ! command -v brew >/dev/null 2>&1; then
		echo "error: Homebrew is required to locate FFmpeg 7" >&2
		exit 1
	fi
	ffmpeg_prefix="$(brew --prefix ffmpeg@7 2>/dev/null || true)"
	if [[ -z "$ffmpeg_prefix" || ! -d "$ffmpeg_prefix/lib/pkgconfig" ]]; then
		echo "error: FFmpeg 7 is required. Install it with: brew install ffmpeg@7" >&2
		exit 1
	fi
	export PATH="$ffmpeg_prefix/bin:$PATH"
	export PKG_CONFIG_PATH="$ffmpeg_prefix/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
fi

export CAP_GPUI_DEV=0
cd "$repo_root"
exec pnpm --filter=@cap/desktop dev:tauri
