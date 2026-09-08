import assert from "node:assert/strict";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {
  buildFinalAsrProvenance,
  validateFinalAsrProvenance,
} from "./validate-final-asr-provenance.mjs";

test("any media or EDL change invalidates final-ASR evidence", async () => {
  const dir = mkdtempSync(join(tmpdir(), "final-asr-provenance-"));
  try {
    const media = join(dir, "final.mp4");
    const edl = join(dir, "final.edl.json");
    const raw = join(dir, "final.raw.json");
    const srt = join(dir, "final.srt");
    writeFileSync(media, "media-a");
    writeFileSync(edl, "edl-a");
    writeFileSync(raw, "raw-a");
    writeFileSync(srt, "srt-a");

    const receipt = await buildFinalAsrProvenance({media, edl, raw, srt});
    assert.equal((await validateFinalAsrProvenance(receipt)).valid, true);

    writeFileSync(edl, "edl-b");
    const stale = await validateFinalAsrProvenance(receipt);
    assert.equal(stale.valid, false);
    assert.deepEqual(stale.mismatches, ["edlSha256"]);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
