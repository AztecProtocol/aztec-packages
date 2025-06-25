#!/bin/bash

echo "=== Memory Constrained Test (512MB limit) ==="
echo

# Test 1: Naive approach with 512MB limit
echo "1. NAIVE approach (loading entire 2GB file):"
echo "Expected: Should be killed by OOM killer"
echo "Running..."
docker run --rm --memory="512m" --memory-swap="512m" \
    -v $(pwd):/workspace \
    -v /tmp/test_2gb.dat:/tmp/test_2gb.dat:ro \
    -w /workspace \
    aztecprotocol/build:3.0 \
    bash -c "./test_mmap_window naive 2>&1" && echo "Status: COMPLETED" || echo "Status: KILLED (OOM)"

echo
echo "----------------------------------------"
echo

# Test 2: MMAP approach with 512MB limit  
echo "2. MMAP approach (16MB sliding window):"
echo "Expected: Should complete successfully"
echo "Running..."
docker run --rm --memory="512m" --memory-swap="512m" \
    -v $(pwd):/workspace \
    -v /tmp/test_2gb.dat:/tmp/test_2gb.dat:ro \
    -w /workspace \
    aztecprotocol/build:3.0 \
    bash -c "./test_mmap_window mmap 2>&1" && echo "Status: COMPLETED" || echo "Status: FAILED"