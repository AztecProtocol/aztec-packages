#!/bin/bash
# Run benchmarks in Docker containers with resource constraints.
# Usage: ./bench.sh [profile]
#
# Profiles:
#   macbook-air    8 cores, 8GB RAM
#   iphone         2 cores, 4GB RAM, ARM (via QEMU)
#   browser-wasm   2 cores, 4GB RAM
#   low-end-phone  2 cores, 2GB RAM
#   all            Run all profiles

set -euo pipefail

PROFILE="${1:-all}"
IMAGE="zkvm-bench"

# Build the benchmark image if it doesn't exist
if ! docker image inspect "$IMAGE" &>/dev/null; then
    echo "Building benchmark image..."
    docker build -t "$IMAGE" -f Dockerfile.bench .
fi

run_profile() {
    local name="$1"
    local cpus="$2"
    local memory="$3"
    local extra="${4:-}"

    echo "=== Running profile: $name (cpus=$cpus, memory=$memory) ==="
    docker run --rm \
        --cpus="$cpus" \
        --memory="$memory" \
        $extra \
        "$IMAGE" --workload all --profile "$name"
}

case "$PROFILE" in
    macbook-air)
        run_profile "macbook-air" 8 "8g"
        ;;
    iphone)
        run_profile "iphone" 2 "4g" "--platform linux/arm64"
        ;;
    browser-wasm)
        run_profile "browser-wasm" 2 "4g"
        ;;
    low-end-phone)
        run_profile "low-end-phone" 2 "2g"
        ;;
    all)
        run_profile "macbook-air" 8 "8g"
        run_profile "browser-wasm" 2 "4g"
        run_profile "low-end-phone" 2 "2g"
        # ARM emulation requires QEMU binfmt_misc setup
        if docker run --rm --platform linux/arm64 alpine uname -m 2>/dev/null | grep -q aarch64; then
            run_profile "iphone" 2 "4g" "--platform linux/arm64"
        else
            echo "Skipping ARM profile (QEMU not configured)"
        fi
        ;;
    *)
        echo "Unknown profile: $PROFILE"
        echo "Available: macbook-air, iphone, browser-wasm, low-end-phone, all"
        exit 1
        ;;
esac
