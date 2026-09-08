import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("local packaging uses a persistent certificate identity instead of ad-hoc signing", () => {
	const script = readFileSync(
		new URL("./build-cap-local.sh", import.meta.url),
		"utf8",
	);

	assert.match(script, /CAP_LOCAL_SIGNING_IDENTITY/);
	assert.match(script, /CapMotion Local Code Signing/);
	assert.match(script, /security find-identity/);
	assert.match(
		script,
		/codesign --force --deep --sign "\$signing_identity" "\$staged_app\/Contents\/Frameworks\/Spacedrive\.framework"/,
	);
	assert.match(script, /for binary in cap-cli cap-exporter cap-muxer/);
	assert.match(script, /codesign --force --sign "\$signing_identity"/);
	assert.doesNotMatch(script, /codesign --force --(?:deep --)?sign -/);
	assert.doesNotMatch(script, /--requirements/);
	assert.match(script, /Signature=adhoc/);
	assert.match(script, /previous build used ad-hoc signing/);
	assert.match(script, /codesign --verify --strict -R/);
	assert.match(script, /signing identity changed/);
	assert.match(script, /CAP_LOCAL_REUSE_BUILD/);
	assert.match(script, /codesign -d -r-/);
	assert.doesNotMatch(script, /designated => cdhash/);
});

test("project-window registries exist before single-instance file-open callbacks", () => {
	const source = readFileSync(
		new URL(
			"../apps/desktop/src-tauri/src/lib.rs",
			import.meta.url,
		),
		"utf8",
	);
	const builderStart = source.indexOf("let mut builder = tauri::Builder::default()");
	const singleInstancePlugin = source.indexOf(
		".plugin(tauri_plugin_single_instance::init",
		builderStart,
	);

	assert.ok(builderStart >= 0, "Tauri builder initialization must exist");
	assert.ok(singleInstancePlugin > builderStart, "single-instance plugin must exist");
	for (const state of [
		"EditorWindowIds::default()",
		"ScreenshotEditorWindowIds::default()",
		"EditorRecordingTarget::default()",
	]) {
		const registration = source.indexOf(`.manage(${state})`, builderStart);
		assert.ok(registration > builderStart, `${state} must be managed by the builder`);
		assert.ok(
			registration < singleInstancePlugin,
			`${state} must be registered before file-open callbacks can run`,
		);
	}
});
