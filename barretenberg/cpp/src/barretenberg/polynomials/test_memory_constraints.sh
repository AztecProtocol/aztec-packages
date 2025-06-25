#!/bin/bash

echo "=== Memory Constrained Test (512MB limit) ==="
echo

# Test 1: Heap-based polynomial with 512MB limit
echo "1. HEAP-BASED polynomial (needs ~768MB for 3x256MB):"
echo "Expected: Should be killed by OOM killer"
echo "Running..."
docker run --rm --memory="512m" --memory-swap="512m" \
    -v $(pwd):/workspace \
    -w /workspace \
    aztecprotocol/build:3.0 \
    ./standalone_memory_test heap 2>&1 && echo "Status: COMPLETED" || echo "Status: KILLED (OOM)"

echo
echo "----------------------------------------"
echo

# Test 2: File-backed polynomial with 512MB limit  
echo "2. FILE-BACKED polynomial (only needs ~256MB in heap):"
echo "Expected: Should complete successfully"
echo "Running..."
docker run --rm --memory="512m" --memory-swap="512m" \
    -v $(pwd):/workspace \
    -w /workspace \
    aztecprotocol/build:3.0 \
    ./standalone_memory_test filebacked 2>&1 && echo "Status: COMPLETED" || echo "Status: FAILED"

echo
echo "=== Test without memory limit (for comparison) ==="
echo

# Test 3: Heap-based without limit
echo "3. HEAP-BASED polynomial (no memory limit):"
docker run --rm \
    -v $(pwd):/workspace \
    -w /workspace \
    aztecprotocol/build:3.0 \
    ./standalone_memory_test heap 2>&1 | tail -10

echo
echo "----------------------------------------"
echo

# Test 4: File-backed without limit
echo "4. FILE-BACKED polynomial (no memory limit):"
docker run --rm \
    -v $(pwd):/workspace \
    -w /workspace \
    aztecprotocol/build:3.0 \
    ./standalone_memory_test filebacked 2>&1 | tail -10