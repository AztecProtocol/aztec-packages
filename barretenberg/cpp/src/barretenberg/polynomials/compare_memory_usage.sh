#!/bin/bash

# Script to compare memory usage between different approaches
# Uses existing MSM benchmarks with larger data size

BINARY="./bin/polynomials_tests"

echo "=== MEMORY USAGE COMPARISON ==="
echo "Testing with existing MSM benchmarks"
echo ""

# First create the persistent files
echo "Creating test files..."
$BINARY --gtest_filter="*MSMMemoryBenchmark.CreatePersistentFiles*" > /dev/null 2>&1

echo ""
echo "Running tests in separate processes to get accurate peak RSS..."
echo ""

# Function to run test and extract RSS
run_and_extract() {
    local test_name=$1
    local description=$2
    
    echo "=== $description ==="
    output=$($BINARY --gtest_filter="*MSMMemoryBenchmark.$test_name*" 2>/dev/null)
    
    # Extract key metrics
    peak_rss=$(echo "$output" | grep "Peak RSS:" | tail -1 | awk '{print $3}')
    time=$(echo "$output" | grep "Time:" | tail -1 | awk '{print $2}')
    rss_increase=$(echo "$output" | grep "RSS increase:" | tail -1 | awk '{print $3}')
    
    echo "Peak RSS: $peak_rss MB"
    echo "RSS increase: $rss_increase MB"
    echo "Time: $time ms"
    echo ""
}

# Run different configurations
run_and_extract "HeapPolynomial" "1. HEAP ALLOCATION (baseline)"
run_and_extract "MmapNoPageDropping" "2. MMAP WITHOUT PAGE DROPPING"
run_and_extract "Mmap4MB" "3. MMAP WITH 4MB WINDOW (MADV_DONTNEED)"
run_and_extract "Mmap8MB" "4. MMAP WITH 8MB WINDOW (MADV_DONTNEED)"
run_and_extract "Mmap16MB" "5. MMAP WITH 16MB WINDOW (MADV_DONTNEED)"

echo "=== ANALYSIS ==="
echo "Peak RSS from getrusage() shows the maximum memory ever used."
echo "With file-backed mmap and MADV_DONTNEED:"
echo "- Pages are dropped from physical memory"
echo "- But peak RSS still shows the maximum that was used"
echo "- Real memory savings occur but aren't reflected in peak RSS"
echo ""
echo "To see actual memory savings, we would need to:"
echo "1. Monitor RSS continuously (not just peak)"
echo "2. Use tools like vmmap or top to observe real-time memory"
echo "3. Run under memory pressure to force page reclamation"