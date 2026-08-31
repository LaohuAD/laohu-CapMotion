#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  printf 'Usage: extract-audio.sh <input-media> <output.mp3>\n' >&2
  exit 2
fi

input=$1
output=$2

if [[ ! -f "$input" ]]; then
  printf 'Input media does not exist: %s\n' "$input" >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
ffmpeg_bin=${FFMPEG_BIN:-}
ffprobe_bin=${FFPROBE_BIN:-}
if [[ -z "$ffmpeg_bin" ]]; then
  [[ -x /opt/homebrew/opt/ffmpeg@7/bin/ffmpeg ]] && ffmpeg_bin=/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg || ffmpeg_bin=ffmpeg
fi
if [[ -z "$ffprobe_bin" ]]; then
  [[ -x /opt/homebrew/opt/ffmpeg@7/bin/ffprobe ]] && ffprobe_bin=/opt/homebrew/opt/ffmpeg@7/bin/ffprobe || ffprobe_bin=ffprobe
fi

"$ffmpeg_bin" -hide_banner -loglevel error -y -i "$input" -map 0:a:0 -vn -ac 1 -ar 16000 -c:a libmp3lame -b:a 64k "$output"

duration=$("$ffprobe_bin" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$output")
size=$(stat -f '%z' "$output")
printf '{"audio":"%s","durationSeconds":%s,"sizeBytes":%s}\n' "$output" "$duration" "$size"
