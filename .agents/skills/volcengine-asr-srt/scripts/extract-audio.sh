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
ffmpeg -hide_banner -loglevel error -y -i "$input" -map 0:a:0 -vn -ac 1 -ar 16000 -c:a libmp3lame -b:a 64k "$output"

duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$output")
size=$(stat -f '%z' "$output")
printf '{"audio":"%s","durationSeconds":%s,"sizeBytes":%s}\n' "$output" "$duration" "$size"
