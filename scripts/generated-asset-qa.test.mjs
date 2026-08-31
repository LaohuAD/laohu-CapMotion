import assert from "node:assert/strict";
import {test} from "node:test";

import {evaluateGeneratedAssetProbe} from "./generated-asset-qa.mjs";

const avatarTask = {
  id: "avatar-1",
  type: "AVATAR",
  finalRange: {start: 10, end: 35},
};

test("hard QA accepts an actual 1280x720 avatar matching its frozen duration", () => {
  const result = evaluateGeneratedAssetProbe(avatarTask, {
    streams: [{codec_type: "video", width: 1280, height: 720, r_frame_rate: "30/1", duration: "25.000"}],
    format: {duration: "25.000"},
  });
  assert.equal(result.hardStatus, "PASS");
  assert.equal(result.manualStatus, "OBSERVE");
  assert.deepEqual(result.manualChecks, ["lipSync", "characterConsistency", "firstLastPose", "continuityHandoff"]);
});

test("hard QA rejects portrait, wrong resolution, or duration drift", () => {
  const result = evaluateGeneratedAssetProbe(avatarTask, {
    streams: [{codec_type: "video", width: 720, height: 1280, r_frame_rate: "30/1"}],
    format: {duration: "23.5"},
  });
  assert.equal(result.hardStatus, "FAIL");
  assert(result.errors.includes("AVATAR_NOT_720P_HORIZONTAL"));
  assert(result.errors.includes("ASSET_DURATION_MISMATCH"));
});

test("screen recording and evidence overlays require 16:9 media and task-specific viewing checks", () => {
  for (const type of ["SCREEN_RECORDING", "EVIDENCE"]) {
    const result = evaluateGeneratedAssetProbe({...avatarTask, type}, {
      streams: [{codec_type: "video", width: 1920, height: 1080, r_frame_rate: "30/1", duration: "25"}],
      format: {duration: "25"},
    });
    assert.equal(result.hardStatus, "PASS");
    assert(result.manualChecks.includes(type === "SCREEN_RECORDING" ? "operationState" : "claimSupport"));
  }
  const invalid = evaluateGeneratedAssetProbe({...avatarTask, type: "EVIDENCE"}, {
    streams: [{codec_type: "video", width: 1000, height: 1000, r_frame_rate: "30/1", duration: "25"}],
    format: {duration: "25"},
  });
  assert(invalid.errors.includes("OVERLAY_NOT_16_9_HORIZONTAL"));
});
