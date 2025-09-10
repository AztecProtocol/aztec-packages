#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
cd ../..

parallel_cmds=()
batch=()
batch_size=100
for i in $(git ls-files '*.ts'); do
  if [[ $i == foundation* || $i == scripts*  || $i == stdlib* || $i == kv-store* || $i == native* ]]; then
    continue
  fi
  if [[ $i == simulator/src/public/avm/opcodes* ]]; then
    # Too granular
    continue
  fi
  if [[ $i == *node_modules* || $i == *.json* || $i == */dest/* || $i == *.d.ts ]]; then
    # Unwanted
    continue
  fi

  batch+=("\"$i\"")

  if [ ${#batch[@]} -eq $batch_size ]; then
    parallel_cmds+=("node scripts/instrumenting-profiler/instrument.mjs ${batch[*]}")
    batch=()
  fi
done

# Handle remaining files in the last batch
if [ ${#batch[@]} -gt 0 ]; then
  parallel_cmds+=("node scripts/instrumenting-profiler/instrument.mjs ${batch[*]}")
fi

parallel --line-buffer --halt now,fail=1 "{}" ::: "${parallel_cmds[@]}"
