#!/usr/bin/env bash
# Builds bb with Tracy profiling, runs a chonk prove with real IVC inputs,
# captures a Tracy trace, and uploads it to S3.
# Usage: ci_tracy_chonk_trace.sh [tracy-preset]
#   tracy-preset: one of tracy-memory, tracy-time-instrumented, tracy-time-sampled, tracy-gates
#                 (default: tracy-time-instrumented)
set -eu
source $(git rev-parse --show-toplevel)/ci3/source

cd $root/barretenberg/cpp

TRACY_PRESET="${1:-tracy-time-instrumented}"
TRACY_COMMIT_HASH="5d542dc09f3d9378d005092a4ad446bd405f819a"

build_dir="build-${TRACY_PRESET}"
tracy_src_dir="${build_dir}/_deps/tracy-src"

echo_header "Tracy chonk trace capture (preset: $TRACY_PRESET)"

##############################################################################
# 1. Build bb with Tracy preset
##############################################################################
echo_header "Building bb with Tracy preset: $TRACY_PRESET"
cmake -DCMAKE_MESSAGE_LOG_LEVEL=Warning --preset "$TRACY_PRESET"
cmake --build --preset "$TRACY_PRESET" --target bb

##############################################################################
# 2. Build tracy-capture from the Tracy source that CMake downloaded
##############################################################################
echo_header "Building tracy-capture"

# The tracy source is downloaded by cmake/tracy.cmake during configure.
# We build the headless capture tool from it.
if [ ! -d "$tracy_src_dir" ]; then
  echo "Tracy source not found at $tracy_src_dir, fetching manually..."
  mkdir -p "$tracy_src_dir"
  cd "$tracy_src_dir"
  git init --quiet
  git remote add origin https://github.com/wolfpld/tracy.git 2>/dev/null || true
  git fetch --depth 1 origin --quiet "$TRACY_COMMIT_HASH"
  git reset --quiet --hard FETCH_HEAD
  cd "$root/barretenberg/cpp"
fi

tracy_capture_build="$tracy_src_dir/capture/build"
mkdir -p "$tracy_capture_build"
cd "$tracy_capture_build"
cmake --fresh -DNO_FILESELECTOR=ON -DCMAKE_MESSAGE_LOG_LEVEL=Warning ..
make -j
cd "$root/barretenberg/cpp"

tracy_capture="$tracy_capture_build/tracy-capture"
if [ ! -f "$tracy_capture" ]; then
  echo "Error: tracy-capture binary not found at $tracy_capture"
  exit 1
fi

##############################################################################
# 3. Download real IVC inputs (same pinned inputs as VK test)
##############################################################################
echo_header "Downloading real IVC inputs"

# Source the pinned hash from the VK test script
pinned_short_hash=$(grep '^pinned_short_hash=' scripts/test_chonk_standalone_vks_havent_changed.sh | head -1 | cut -d'"' -f2)
pinned_chonk_inputs_url="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-chonk-inputs-${pinned_short_hash}.tar.gz"

inputs_dir=$(mktemp -d)
trap 'rm -rf "$inputs_dir"' EXIT

echo "Downloading from: $pinned_chonk_inputs_url"
if ! curl -s -f "$pinned_chonk_inputs_url" -o "$inputs_dir/bb-chonk-inputs.tar.gz"; then
  echo "Error: Failed to download pinned IVC inputs"
  exit 1
fi

tar -xzf "$inputs_dir/bb-chonk-inputs.tar.gz" -C "$inputs_dir"
rm -f "$inputs_dir/bb-chonk-inputs.tar.gz"

# Pick the first flow for the trace (one tx is enough for profiling)
flow=$(ls "$inputs_dir" | head -1)
flow_path="$inputs_dir/$flow"
echo "Using flow: $flow"

if [ ! -f "$flow_path/ivc-inputs.msgpack" ]; then
  echo "Error: ivc-inputs.msgpack not found in $flow_path"
  exit 1
fi

##############################################################################
# 4. Run tracy-capture + bb prove
##############################################################################
echo_header "Capturing Tracy trace for flow: $flow"

trace_file="/tmp/tracy-trace-chonk-${TRACY_PRESET}.utrace"

# Start headless tracy capture in background
"$tracy_capture" -a 127.0.0.1 -f -o "$trace_file" &
capture_pid=$!
sleep 0.5

# Run the actual prove with real inputs
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
bb_binary="./${build_dir}/bin/bb"

echo "Running: $bb_binary prove --scheme chonk --ivc_inputs_path $flow_path/ivc-inputs.msgpack"
"$bb_binary" prove --scheme chonk \
  --ivc_inputs_path "$flow_path/ivc-inputs.msgpack" \
  -o /tmp/tracy-chonk-proof \
  -v || {
    echo "Warning: bb prove failed, but trace may still be useful"
  }

# Give tracy-capture time to flush, then stop it
sleep 2
kill "$capture_pid" 2>/dev/null || true
wait "$capture_pid" 2>/dev/null || true

if [ ! -f "$trace_file" ]; then
  echo "Error: Tracy trace file not produced"
  exit 1
fi

trace_size=$(stat -c%s "$trace_file" 2>/dev/null || stat -f%z "$trace_file")
echo "Tracy trace captured: $trace_file ($(( trace_size / 1024 / 1024 ))MB)"

##############################################################################
# 5. Upload trace to S3
##############################################################################
echo_header "Uploading Tracy trace"

current_sha=$(git rev-parse --short HEAD)
date_stamp=$(date -u +%Y%m%d)
s3_key="tracy-traces/chonk-${TRACY_PRESET}-${date_stamp}-${current_sha}.utrace.zst"
s3_uri="s3://aztec-ci-artifacts/protocol/${s3_key}"

# Compress with zstd for efficient storage
zstd -T0 -q "$trace_file" -o "${trace_file}.zst"
compressed_size=$(stat -c%s "${trace_file}.zst" 2>/dev/null || stat -f%z "${trace_file}.zst")
echo "Compressed trace: $(( compressed_size / 1024 / 1024 ))MB"

aws ${S3_BUILD_CACHE_AWS_PARAMS:-} s3 cp "${trace_file}.zst" "$s3_uri"

echo ""
echo "Tracy trace uploaded to: $s3_uri"
echo "Download with: aws s3 cp $s3_uri trace.utrace.zst && zstd -d trace.utrace.zst"
echo "View with: tracy trace.utrace"

# Clean up
rm -f "$trace_file" "${trace_file}.zst" /tmp/tracy-chonk-proof
