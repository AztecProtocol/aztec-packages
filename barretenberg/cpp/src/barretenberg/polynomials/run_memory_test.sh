#!/bin/bash

echo "=== Testing with 512MB memory limit ==="
echo
echo "1. Running NAIVE approach (should fail with OOM):"
echo "------------------------------------------------"
timeout 30 docker run --rm --memory="512m" --memory-swap="512m" \
    -v $(pwd):/workspace \
    -v /tmp/test_2gb.dat:/tmp/test_2gb.dat:ro \
    -w /workspace \
    aztecprotocol/build:3.0 ./test_mmap_window naive 2>&1 || echo "FAILED (as expected)"

echo
echo "2. Running MMAP approach (should succeed):"
echo "------------------------------------------"
timeout 60 docker run --rm --memory="512m" --memory-swap="512m" \
    -v $(pwd):/workspace \
    -v /tmp/test_2gb.dat:/tmp/test_2gb.dat:ro \
    -w /workspace \
    aztecprotocol/build:3.0 ./test_mmap_window mmap 2>&1 || echo "FAILED"

echo
echo "=== Testing without memory limit (for comparison) ==="
echo
echo "3. Running NAIVE approach (should succeed):"
echo "-------------------------------------------"
docker run --rm \
    -v $(pwd):/workspace \
    -v /tmp/test_2gb.dat:/tmp/test_2gb.dat:ro \
    -w /workspace \
    aztecprotocol/build:3.0 ./test_mmap_window naive 2>&1

echo
echo "4. Running MMAP approach (should succeed):"
echo "------------------------------------------"
docker run --rm \
    -v $(pwd):/workspace \
    -v /tmp/test_2gb.dat:/tmp/test_2gb.dat:ro \
    -w /workspace \
    aztecprotocol/build:3.0 ./test_mmap_window mmap 2>&1