import assert from "node:assert/strict";
import test from "node:test";
import {
	assertInstallVersion,
	assertReleaseHistory,
	nextCapMotionVersion,
} from "./check-cap-local-release.mjs";

test("increments the patch component for an ordinary update", () => {
	assert.equal(nextCapMotionVersion("0.1.0"), "0.1.1");
});

test("rolls 0.1.9 over to 0.2.0", () => {
	assert.equal(nextCapMotionVersion("0.1.9"), "0.2.0");
});

test("rolls 0.9.9 over to 1.0.0", () => {
	assert.equal(nextCapMotionVersion("0.9.9"), "1.0.0");
});

test("accepts a package whose newest bilingual release note has the same version", () => {
	assert.doesNotThrow(() =>
		assertReleaseHistory("0.1.1", [
			{
				version: "0.1.1",
				title: { en: "Release", "zh-CN": "版本" },
				content: { en: "Changes", "zh-CN": "更新内容" },
			},
		]),
	);
});

test("rejects a package version with no matching newest release note", () => {
	assert.throws(
		() =>
			assertReleaseHistory("0.1.2", [
				{
					version: "0.1.1",
					title: { en: "Release", "zh-CN": "版本" },
					content: { en: "Changes", "zh-CN": "更新内容" },
				},
			]),
		/package version 0\.1\.2.*release note 0\.1\.1/i,
	);
});

test("rejects a release note missing either language", () => {
	assert.throws(
		() =>
			assertReleaseHistory("0.1.1", [
				{
					version: "0.1.1",
					title: { en: "Release", "zh-CN": "" },
					content: { en: "Changes", "zh-CN": "更新内容" },
				},
			]),
		/bilingual/i,
	);
});

test("allows an exact next installed version or a same-version packaging retry", () => {
	assert.doesNotThrow(() => assertInstallVersion("0.1.1", "0.1.0"));
	assert.doesNotThrow(() => assertInstallVersion("0.1.1", "0.1.1"));
});

test("rejects skipped or downgraded installed versions", () => {
	assert.throws(
		() => assertInstallVersion("0.1.3", "0.1.1"),
		/expected 0\.1\.2/i,
	);
	assert.throws(
		() => assertInstallVersion("0.1.0", "0.1.1"),
		/expected 0\.1\.2/i,
	);
});
