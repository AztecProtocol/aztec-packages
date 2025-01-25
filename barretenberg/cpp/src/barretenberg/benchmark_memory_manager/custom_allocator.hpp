#pragma once
#include <benchmark/benchmark.h>
#include <cstddef>
#include <iostream>
#include <mutex>
#include <vector>

class TrackingAllocator {
  public:
    TrackingAllocator()
        : total_allocations(0)
        , total_deallocated(0)
        , total_memory(0)
    {}

    void* malloc(size_t size);
    void free(void* ptr);

    int64_t current_memory_usage() const
    {
        std::lock_guard<std::mutex> lock(mutex_);
        return total_memory;
    }

    int64_t current_allocations() const
    {
        std::lock_guard<std::mutex> lock(mutex_);
        return total_allocations;
    }

    void reset()
    {
        std::lock_guard<std::mutex> lock(mutex_);
        total_allocations = total_deallocated = total_memory = 0;
        allocations.clear();
    }

    void printStatistics() const
    {
        std::lock_guard<std::mutex> lock(mutex_);
        std::cout << "Total Allocations: " << total_allocations << "\n";
        std::cout << "Total Deallocations: " << total_deallocated << "\n";
        std::cout << "Current Memory Usage: " << total_memory << " bytes\n";
    }

  private:
    mutable std::mutex mutex_;
    int64_t total_allocations;
    int64_t total_deallocated;
    int64_t total_memory;
    std::vector<std::pair<void*, std::size_t>> allocations;
};

// Global tracking allocator instance
extern TrackingAllocator g_allocator;

// Function declarations for malloc and free hooks
void* malloc(size_t size);
void free(void* ptr);

class BenchmarkMemoryManager : public benchmark::MemoryManager {
  public:
    void Start() override { g_allocator.reset(); }
    void Stop(Result& result) override
    {
        result.num_allocs = g_allocator.current_allocations();
        result.max_bytes_used = g_allocator.current_memory_usage();
    }
};