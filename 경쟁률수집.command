#!/bin/sh
# 맥에서 쓰실 때: 터미널에서 sh 경쟁률수집.command
cd "$(dirname "$0")"
python3 scripts/ratio_fetch.py && python3 scripts/ratio_build.py && open ratio.html
