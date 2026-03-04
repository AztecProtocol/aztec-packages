#!/usr/bin/env bash
# Post-job: Download benchmarks if applicable.
# Sets SHOULD_UPLOAD_BENCHMARKS in GITHUB_ENV for the subsequent upload step.
# Env: SHOULD_UPLOAD_BENCHMARKS, GITHUB_ENV
set -euo pipefail

if [ "${SHOULD_UPLOAD_BENCHMARKS:-0}" -eq 0 ]; then
  exit 0
fi

echo "Downloading benchmarks..."
if ./ci.sh gh-bench && [ -f "./bench-out/bench.json" ] && [ "$(cat ./bench-out/bench.json)" != "[]" ]; then
  echo "Benchmarks downloaded successfully"
  echo "SHOULD_UPLOAD_BENCHMARKS=1" >> $GITHUB_ENV
else
  echo "No benchmarks to upload"
  echo "SHOULD_UPLOAD_BENCHMARKS=0" >> $GITHUB_ENV
fi
