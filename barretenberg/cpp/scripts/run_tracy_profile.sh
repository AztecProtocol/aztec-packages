#!/usr/bin/env bash
# Nightly CI script: build bb with Tracy memory profiling, run a chonk prove
# against pinned IVC inputs, capture the Tracy trace, and upload to S3.
set -eu
source $(git rev-parse --show-toplevel)/ci3/source

cd $root/barretenberg/cpp

TRACY_PRESET="tracy-memory"
TRACY_BUILD_DIR="build-$TRACY_PRESET"
TRACY_COMMIT="5d542dc09f3d9378d005092a4ad446bd405f819a"

# Reuse pinned inputs from the existing VK test script.
source $root/barretenberg/cpp/scripts/test_chonk_standalone_vks_havent_changed.sh --help >/dev/null 2>&1 || true

# The pinned hash and URL are defined in test_chonk_standalone_vks_havent_changed.sh.
# We re-source just the variables we need.
pinned_short_hash="aafc0a7e"
pinned_chonk_inputs_url="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-chonk-inputs-${pinned_short_hash}.tar.gz"

###############################################################################
# 1. Build bb with Tracy preset
###############################################################################
echo "Building bb with preset $TRACY_PRESET..."
cmake --preset $TRACY_PRESET
cmake --build --preset $TRACY_PRESET --target bb

bb="$TRACY_BUILD_DIR/bin/bb"

###############################################################################
# 2. Build tracy-capture (headless trace capture tool)
###############################################################################
echo "Building tracy-capture..."
TRACY_DIR="/tmp/tracy-capture-build"
if [ ! -x "$TRACY_DIR/capture/build/tracy-capture" ]; then
  rm -rf "$TRACY_DIR"
  mkdir -p "$TRACY_DIR"
  cd "$TRACY_DIR"
  git init --quiet
  git remote add origin https://github.com/wolfpld/tracy.git 2>/dev/null || true
  git fetch --depth 1 origin --quiet $TRACY_COMMIT
  git reset --quiet --hard FETCH_HEAD
  cd capture
  mkdir -p build && cd build
  cmake --fresh -DNO_FILESELECTOR=ON -DCMAKE_MESSAGE_LOG_LEVEL=Warning ..
  make -j$(nproc)
fi
TRACY_CAPTURE="$TRACY_DIR/capture/build/tracy-capture"
cd $root/barretenberg/cpp

###############################################################################
# 3. Download pinned IVC inputs
###############################################################################
inputs_dir=$(mktemp -d)
trap 'rm -rf "$inputs_dir" /tmp/bb-chonk-inputs.tar.gz' EXIT SIGINT

echo "Downloading pinned IVC inputs (hash: $pinned_short_hash)..."
if ! curl -s -f "$pinned_chonk_inputs_url" -o /tmp/bb-chonk-inputs.tar.gz; then
  echo "Error: Failed to download pinned IVC inputs from $pinned_chonk_inputs_url" >&2
  exit 1
fi
tar -xzf /tmp/bb-chonk-inputs.tar.gz -C "$inputs_dir"

# Pick the first available flow's inputs for profiling
flow=$(ls "$inputs_dir" | head -1)
ivc_inputs="$inputs_dir/$flow/ivc-inputs.msgpack"
echo "Using IVC inputs from flow: $flow"

###############################################################################
# 4. Run tracy-capture + bb prove
###############################################################################
trace_file="/tmp/tracy-chonk-profile.tracy"
rm -f "$trace_file"

echo "Starting tracy-capture in background..."
$TRACY_CAPTURE -a 127.0.0.1 -f -o "$trace_file" &
capture_pid=$!
sleep 0.5

echo "Running chonk prove with Tracy profiling..."
$bb prove --scheme chonk --ivc_inputs_path "$ivc_inputs" --output_path /tmp/tracy-proof-out || true

# Give tracy-capture time to finish writing
sleep 2
# tracy-capture exits when the profiled process disconnects; wait for it
wait $capture_pid 2>/dev/null || true

if [ ! -f "$trace_file" ]; then
  echo "Error: Tracy trace file was not created" >&2
  exit 1
fi

trace_size=$(stat -c%s "$trace_file" 2>/dev/null || stat -f%z "$trace_file")
echo "Tracy trace captured: $trace_file ($trace_size bytes)"

###############################################################################
# 5. Upload trace to S3
###############################################################################
commit_short=$(git rev-parse --short HEAD)
date_str=$(date -u +%Y-%m-%d)
s3_key="bb-tracy-profiles/chonk-profile-${date_str}-${commit_short}.tracy"
s3_uri="s3://aztec-ci-artifacts/protocol/${s3_key}"

echo "Uploading Tracy trace to ${s3_uri}..."
aws s3 cp "$trace_file" "$s3_uri"

# Also upload as "latest" for easy access
aws s3 cp "$trace_file" "s3://aztec-ci-artifacts/protocol/bb-tracy-profiles/chonk-profile-latest.tracy"

echo "Tracy profile uploaded successfully."
echo "  Dated: https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/${s3_key}"
echo "  Latest: https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-tracy-profiles/chonk-profile-latest.tracy"
