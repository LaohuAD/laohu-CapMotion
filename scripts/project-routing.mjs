export function routeProjectTask({phase, request}) {
  if (phase === "FIRST_PASS" && request === "CAP_TO_ASR") {
    return {
      owner: "UPSTREAM_WRITING_THREAD",
      entry: "scripts/cap-project-asr.mjs",
      createDedicatedTask: false,
    };
  }
  if (phase !== "SECOND_PASS") throw new Error("UNSUPPORTED_PHASE_OR_REQUEST");
  if (request === "POSTPRODUCTION_PACKAGE") {
    return {
      owner: "LAOHU_VIDEO_POSTPRODUCTION",
      skill: "laohu-video-postproduction",
      createDedicatedTask: true,
    };
  }
  if (request === "PROGRAM_ANIMATION") {
    return {
      owner: "LAOHU_VIDEO_POSTPRODUCTION",
      skill: "laohu-animation-director",
      engine: "REMOTION",
      createDedicatedTask: true,
    };
  }
  if (request === "AVATAR") {
    return {
      owner: "LAOHU_VIDEO_POSTPRODUCTION",
      skill: "runninghub-avatar",
      createDedicatedTask: true,
    };
  }
  if (request === "CORRECT_SRT") {
    return {
      owner: "LAOHU_VIDEO_POSTPRODUCTION",
      skill: "correct-srt-subtitles",
      createDedicatedTask: true,
    };
  }
  if (request === "BURN_SUBTITLES") {
    return {
      owner: "LAOHU_VIDEO_POSTPRODUCTION",
      skill: "burn-subtitles",
      createDedicatedTask: true,
    };
  }
  if (request === "JIANYING_ASR") {
    return {
      owner: "LAOHU_VIDEO_POSTPRODUCTION",
      skill: "jianying-srt-bridge",
      requiresExplicitUserAuthorization: true,
      createDedicatedTask: true,
    };
  }
  throw new Error("UNSUPPORTED_PHASE_OR_REQUEST");
}

export function routeProjectEvolution({authorized, request}) {
  if (request !== "EVOLVE" || authorized !== true) throw new Error("PROJECT_EVOLUTION_AUTHORIZATION_REQUIRED");
  return {
    owner: "LAOHU_VIDEO_EVOLUTION",
    skill: "laohu-video-evolution",
    createDedicatedTask: false,
  };
}
