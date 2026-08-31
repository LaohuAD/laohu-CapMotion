import assert from "node:assert/strict";
import {test} from "node:test";

import {routeProjectEvolution, routeProjectTask} from "./project-routing.mjs";

test("first-pass Cap is routed to the reusable ASR entry without creating a postproduction task", () => {
  assert.deepEqual(routeProjectTask({phase: "FIRST_PASS", request: "CAP_TO_ASR"}), {
    owner: "UPSTREAM_WRITING_THREAD",
    entry: "scripts/cap-project-asr.mjs",
    createDedicatedTask: false,
  });
});

test("second-pass package is owned by one dedicated video task", () => {
  const route = routeProjectTask({phase: "SECOND_PASS", request: "POSTPRODUCTION_PACKAGE"});
  assert.equal(route.owner, "LAOHU_VIDEO_POSTPRODUCTION");
  assert.equal(route.skill, "laohu-video-postproduction");
  assert.equal(route.createDedicatedTask, true);
});

test("all new program animation routes to Remotion", () => {
  assert.equal(routeProjectTask({phase: "SECOND_PASS", request: "PROGRAM_ANIMATION"}).skill, "laohu-animation-director");
});

test("specialized second-pass work reaches one accountable skill", () => {
  assert.equal(routeProjectTask({phase: "SECOND_PASS", request: "AVATAR"}).skill, "runninghub-avatar");
  assert.equal(routeProjectTask({phase: "SECOND_PASS", request: "CORRECT_SRT"}).skill, "correct-srt-subtitles");
  assert.equal(routeProjectTask({phase: "SECOND_PASS", request: "BURN_SUBTITLES"}).skill, "burn-subtitles");
});

test("Jianying remains an explicit-authority route", () => {
  const route = routeProjectTask({phase: "SECOND_PASS", request: "JIANYING_ASR"});
  assert.equal(route.skill, "jianying-srt-bridge");
  assert.equal(route.requiresExplicitUserAuthorization, true);
});

test("project evolution has one owner and requires user authorization", () => {
  assert.throws(() => routeProjectEvolution({authorized: false, request: "EVOLVE"}), /PROJECT_EVOLUTION_AUTHORIZATION_REQUIRED/);
  assert.equal(routeProjectEvolution({authorized: true, request: "EVOLVE"}).skill, "laohu-video-evolution");
});
