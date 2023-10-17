#!/bin/bash
set -eu

PRESET=gperftools
ONLY_PROCESS=${1:-}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build with heap profiling preset.

cmake --preset $PRESET
cmake --build --preset $PRESET

cd build-$PRESET

if [ -z "$ONLY_PROCESS" ]; then
  # Clear old heap profile data.
  rm -f honk_bench_main_simple.heap*

  # Run application with heap profiling.
  HEAPPROFILE=./honk_bench_main_simple ./bin/honk_bench_main_simple
fi

# Download and install Go
if [ ! -d ~/go ]; then
  ARCHIVE=go1.21.3.linux-amd64.tar.gz
  echo "Downloading and installing Go..."
  curl -O https://golang.org/dl/$ARCHIVE
  tar -C ~/ -xvf $ARCHIVE
  rm $ARCHIVE
  export PATH=$PATH:~/go/bin
fi

# Install pprof
if [ ! -f ~/go/bin/pprof ]; then
    echo "Installing pprof..."
    ~/go/bin/go install github.com/google/pprof@latest
fi

# Collect the heap files
files=(./honk_bench_main_simple.*.heap)
# Find the middle index based on the count
middle_index=$(( (${#files[@]} + 1) / 2 - 1))
# Process the heap profile with pprof
~/go/bin/pprof --text ./bin/honk_bench_main_simple ${files[$middle_index]}