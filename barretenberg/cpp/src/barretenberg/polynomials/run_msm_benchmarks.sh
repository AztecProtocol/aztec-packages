#!/bin/bash

# Script to run MSM benchmarks in separate processes for accurate memory measurement

BINARY="./bin/polynomials_tests"

echo "=== MSM BENCHMARK COMPARISON ==="
echo "Running heavy MSM workload in separate processes"
echo "Data size: 1M points (32 MB total)"
echo ""

# Create the persistent files first
echo "Creating persistent files..."
$BINARY --gtest_filter="*MSMMemoryBenchmark.CreatePersistentFiles*" > /dev/null 2>&1
echo ""

# Function to extract key metrics from output
run_test() {
    local test_name=$1
    local description=$2
    
    echo "Running: $description"
    output=$($BINARY --gtest_filter="*MSMMemoryBenchmark.$test_name*" 2>/dev/null | grep -E "(Time:|Peak RSS:|Memory efficiency:|Throughput:)")
    echo "$output"
    echo ""
}

# Run all variants
echo "1. BASELINE - Heap allocation:"
run_test "HeapPolynomial" "Standard heap-based polynomial"

echo "2. MMAP - No page dropping:"
run_test "MmapNoPageDropping" "Memory-mapped without page dropping"

echo "3. MMAP - 4MB window (MADV_DONTNEED):"
run_test "Mmap4MB" "Memory-mapped with 4MB window using MADV_DONTNEED"

echo "4. MMAP - 4MB window (MADV_FREE):"
run_test "Mmap4MB_MadvFree" "Memory-mapped with 4MB window using MADV_FREE"

echo "5. MMAP - 8MB window (MADV_DONTNEED):"
run_test "Mmap8MB" "Memory-mapped with 8MB window using MADV_DONTNEED"

echo "6. MMAP - 8MB window (MADV_FREE):"
run_test "Mmap8MB_MadvFree" "Memory-mapped with 8MB window using MADV_FREE"

echo "7. MMAP - 16MB window (MADV_DONTNEED):"
run_test "Mmap16MB" "Memory-mapped with 16MB window using MADV_DONTNEED"

echo "8. MMAP - 16MB window (MADV_FREE):"
run_test "Mmap16MB_MadvFree" "Memory-mapped with 16MB window using MADV_FREE"

echo ""
echo "=== SUMMARY ==="
echo "- Each test ran in a separate process for accurate peak RSS measurement"
echo "- MADV_DONTNEED: Immediately frees physical pages (may cause page faults on re-access)"
echo "- MADV_FREE: Marks pages as freeable (freed only under memory pressure)"
echo "- Memory efficiency shows RSS increase as percentage of total data size"