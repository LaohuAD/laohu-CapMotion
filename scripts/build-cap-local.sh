#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
desktop_dir="$repo_root/apps/desktop"
# Keep build intermediates on the workspace volume, including external drives.
export TMPDIR="${CAP_BUILD_TMPDIR:-$repo_root/target/capmotion-release/tmp}"
mkdir -p "$TMPDIR"
# Published apps are stripped below. Avoid generating full debug metadata during
# fat LTO: it can exceed this machine's RAM without changing video quality.
export CARGO_PROFILE_RELEASE_DEBUG="${CARGO_PROFILE_RELEASE_DEBUG:-0}"
source_app="$repo_root/target/release/bundle/macos/CapMotion.app"
destination_app="${CAP_LOCAL_APP_DEST:-/Applications/CapMotion.app}"
if [[ -L "$destination_app" ]]; then
	destination_app="$(node -e 'process.stdout.write(require("node:fs").realpathSync(process.argv[1]))' "$destination_app")"
fi
signing_identity="${CAP_LOCAL_SIGNING_IDENTITY:-CapMotion Local Code Signing}"
legacy_data_dir="$HOME/Library/Application Support/so.cap.desktop.dev"
local_data_dir="$HOME/Library/Application Support/com.laohu.capmotion"
migration_marker="$local_data_dir/.migrated-from-so.cap.desktop.dev"

if ! command -v pnpm >/dev/null 2>&1; then
	echo "error: pnpm is required" >&2
	exit 1
fi

installed_version=""
if [[ -f "$destination_app/Contents/Info.plist" ]]; then
	installed_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$destination_app/Contents/Info.plist" 2>/dev/null || true)"
fi
if [[ -n "$installed_version" ]]; then
	node "$repo_root/scripts/check-cap-local-release.mjs" --installed-version "$installed_version"
else
	node "$repo_root/scripts/check-cap-local-release.mjs"
fi

if ! /usr/bin/security find-identity -v -p codesigning | /usr/bin/grep -Fq "\"$signing_identity\""; then
	echo "error: missing persistent code-signing identity: $signing_identity" >&2
	echo "Import the original CapMotion signing identity before building an update." >&2
	echo "Do not generate a replacement identity: macOS permissions follow the certificate." >&2
	exit 1
fi

if [[ -z "${CAP_LOCAL_PACKAGE_OUTPUT:-}" ]] && pgrep -f "$destination_app/Contents/MacOS/CapMotion" >/dev/null 2>&1; then
	echo "error: CapMotion is running; quit it before replacing the local app" >&2
	exit 1
fi

if [[ "${CAP_LOCAL_REUSE_BUILD:-0}" == "1" ]]; then
	echo "Reusing existing CapMotion application bundle"
else
	export CAP_GPUI_DEV=0
	export CAP_LAOHU_LOCAL_BUILD=1

	cd "$repo_root"
	if [[ ! -d "$repo_root/target/native-deps/Spacedrive.framework" ]]; then
		pnpm -w cap-setup
	else
		echo "Reusing existing native dependencies"
	fi

	cd "$desktop_dir"
	if [[ "${CAP_LOCAL_REUSE_SIDECARS:-0}" == "1" ]]; then
		for sidecar in \
			"src-tauri/binaries/cap-muxer-aarch64-apple-darwin" \
			"src-tauri/binaries/cap-cli-aarch64-apple-darwin" \
			"src-tauri/binaries/cap-exporter-aarch64-apple-darwin"; do
			if [[ ! -x "$sidecar" ]]; then
				echo "error: requested sidecar reuse, but missing executable: $sidecar" >&2
				exit 1
			fi
		done
		echo "Reusing verified existing sidecars"
	else
		pnpm build:sidecar
	fi

	pnpm run preparescript
	pnpm exec dotenv -e ../../.env -- pnpm tauri build \
		--bundles app \
		--config src-tauri/tauri.local.conf.json
fi

if [[ ! -d "$source_app" ]]; then
	echo "error: built app not found: $source_app" >&2
	exit 1
fi

stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/cap-local-install.XXXXXX")"
staged_app="$stage_dir/CapMotion.app"
previous_app="$stage_dir/previous.app"
installed=0

cleanup() {
	if [[ "$installed" -eq 0 && -d "$previous_app" && ! -e "$destination_app" ]]; then
		mv "$previous_app" "$destination_app"
	fi
	rm -rf "$stage_dir"
}
trap cleanup EXIT

/usr/bin/ditto "$source_app" "$staged_app"
/usr/bin/strip -x \
	"$staged_app/Contents/MacOS/CapMotion" \
	"$staged_app/Contents/MacOS/cap-cli" \
	"$staged_app/Contents/MacOS/cap-exporter" \
	"$staged_app/Contents/MacOS/cap-muxer"

# A persistent certificate is required here. macOS TCC records the designated
# requirement and rejects a rebuilt ad-hoc binary even when its bundle ID and
# install path are unchanged.
/usr/bin/codesign --force --deep --sign "$signing_identity" "$staged_app/Contents/Frameworks/Spacedrive.framework"
for binary in cap-cli cap-exporter cap-muxer; do
	/usr/bin/codesign --force --sign "$signing_identity" "$staged_app/Contents/MacOS/$binary"
done

/usr/bin/codesign --force --sign "$signing_identity" "$staged_app"
/usr/bin/codesign --verify --deep --strict "$staged_app"

designated_requirement="$(/usr/bin/codesign -d -r- "$staged_app" 2>&1)"
if [[ "$designated_requirement" != *'identifier "com.laohu.capmotion"'* ]] || \
	[[ "$designated_requirement" == *'cdhash'* ]]; then
	echo "error: local app does not have a certificate-backed stable designated requirement" >&2
	exit 1
fi

bundle_identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$staged_app/Contents/Info.plist")"
if [[ "$bundle_identifier" != "com.laohu.capmotion" ]]; then
	echo "error: unexpected bundle identifier: $bundle_identifier" >&2
	exit 1
fi

verify_update_identity() {
	local existing_app="$1"
	local existing_signature_info
	existing_signature_info="$(/usr/bin/codesign -dvvv "$existing_app" 2>&1 || true)"

	if [[ "$existing_signature_info" == *'Signature=adhoc'* ]]; then
		echo "warning: previous build used ad-hoc signing; this certificate migration requires one final permission grant" >&2
		return
	fi

	local existing_requirement="$stage_dir/existing-designated.req"
	local staged_requirement="$stage_dir/staged-designated.req"
	/usr/bin/codesign -d -r- "$existing_app" 2>&1 \
		| /usr/bin/sed -n 's/^designated => //p' > "$existing_requirement"
	/usr/bin/codesign -d -r- "$staged_app" 2>&1 \
		| /usr/bin/sed -n 's/^designated => //p' > "$staged_requirement"

	if [[ ! -s "$existing_requirement" || ! -s "$staged_requirement" ]] || \
		! /usr/bin/codesign --verify --strict -R "$existing_requirement" "$staged_app" >/dev/null 2>&1 || \
		! /usr/bin/codesign --verify --strict -R "$staged_requirement" "$existing_app" >/dev/null 2>&1; then
		echo "error: CapMotion signing identity changed; refusing an update that would invalidate macOS permissions" >&2
		exit 1
	fi

	echo "Verified permission-compatible CapMotion update identity"
}

if [[ -d "$destination_app" ]]; then
	verify_update_identity "$destination_app"
fi

if [[ -n "${CAP_LOCAL_PACKAGE_OUTPUT:-}" ]]; then
    if [[ -e "$CAP_LOCAL_PACKAGE_OUTPUT" ]]; then
        echo "error: package output already exists: $CAP_LOCAL_PACKAGE_OUTPUT" >&2
        exit 1
    fi
    mkdir -p "$(dirname "$CAP_LOCAL_PACKAGE_OUTPUT")"
    /usr/bin/ditto -c -k --sequesterRsrc --keepParent "$staged_app" "$CAP_LOCAL_PACKAGE_OUTPUT"
    /usr/bin/shasum -a 256 "$CAP_LOCAL_PACKAGE_OUTPUT"
    echo "Created signed release archive without replacing the running app: $CAP_LOCAL_PACKAGE_OUTPUT"
    exit 0
fi

mkdir -p "$(dirname "$destination_app")"
if [[ -e "$destination_app" ]]; then
	mv "$destination_app" "$previous_app"
fi
mv "$staged_app" "$destination_app"
installed=1

if [[ -d "$legacy_data_dir" && ! -e "$migration_marker" ]]; then
	mkdir -p "$local_data_dir"

	for item in store .window-state.json cameraPreview screenshots transcription_models; do
		if [[ -e "$legacy_data_dir/$item" && ! -e "$local_data_dir/$item" ]]; then
			/usr/bin/ditto "$legacy_data_dir/$item" "$local_data_dir/$item"
		fi
	done

	for source in "$legacy_data_dir"/bg-*; do
		if [[ -e "$source" && ! -e "$local_data_dir/$(basename "$source")" ]]; then
			/usr/bin/ditto "$source" "$local_data_dir/$(basename "$source")"
		fi
	done

	if [[ -d "$legacy_data_dir/recordings" ]]; then
		if [[ ! -e "$local_data_dir/recordings" ]]; then
			mv "$legacy_data_dir/recordings" "$local_data_dir/recordings"
		elif [[ -z "$(find "$local_data_dir/recordings" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
			rmdir "$local_data_dir/recordings"
			mv "$legacy_data_dir/recordings" "$local_data_dir/recordings"
		else
			echo "warning: both old and new recording directories contain data; recordings were not moved" >&2
		fi
	fi

	touch "$migration_marker"
	echo "Migrated existing settings and recordings to: $local_data_dir"
fi

echo "Installed Cap local app: $destination_app"
du -sh "$destination_app"
