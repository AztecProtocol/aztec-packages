#!/bin/bash

# Script to demonstrate memory usage difference between naive and optimized file processing

BINARY="./bin/polynomials_tests"

echo "=== LARGE FILE MEMORY BENCHMARK ==="
echo "Comparing naive (load entire file) vs optimized (mmap with page dropping)"
echo ""

# Create the 2GB test file
echo "Step 1: Creating 2GB test file..."
$BINARY --gtest_filter="*LargeFileBenchmark.CreateLargeFile*"
echo ""

# Run naive approach
echo "Step 2: Running NAIVE approach (load entire file into memory)..."
$BINARY --gtest_filter="*LargeFileBenchmark.NaiveLoadEntireFile*"
echo ""

# Run optimized approach
echo "Step 3: Running OPTIMIZED approach (mmap with 16MB window)..."
$BINARY --gtest_filter="*LargeFileBenchmark.OptimizedMmapWithPageDropping*"
echo ""

echo "=== SUMMARY ==="
echo "The naive approach loads the entire 2GB file into memory, causing high RSS."
echo "The optimized approach uses mmap with MADV_DONTNEED to keep only 16MB in memory."
echo "Peak RSS is measured using getrusage() which tracks the maximum RSS during execution."