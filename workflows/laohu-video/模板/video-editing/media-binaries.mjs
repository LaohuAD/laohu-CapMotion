import {existsSync} from "node:fs";

const homebrew7 = "/opt/homebrew/opt/ffmpeg@7/bin";

export const ffmpegBin = process.env.FFMPEG_BIN
  ?? (existsSync(`${homebrew7}/ffmpeg`) ? `${homebrew7}/ffmpeg` : "ffmpeg");

export const ffprobeBin = process.env.FFPROBE_BIN
  ?? (existsSync(`${homebrew7}/ffprobe`) ? `${homebrew7}/ffprobe` : "ffprobe");
