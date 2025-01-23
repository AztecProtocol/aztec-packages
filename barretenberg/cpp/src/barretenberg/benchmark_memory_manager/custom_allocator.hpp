#pragma once
#include <benchmark/benchmark.h>
#include <cstddef>
#include <iostream>
#include <vector>

class TrackingAllocator {
  public:
    TrackingAllocator()
        : total_allocations(0)
        , total_deallocated(0)
        , total_memory(0)
    {}

    void* allocate(std::size_t size);
    void deallocate(void* ptr);
    int64_t current_memory_usage() const { return total_memory; }
    void reset()
    {
        total_allocations = total_deallocated = total_memory = 0;
        allocations.clear();
    }

    // Print allocation statistics
    void printStatistics() const
    {
        std::cout << "Total Allocations: " << total_allocations << "\n";
        std::cout << "Total Deallocations: " << total_deallocated << "\n";
        std::cout << "Current Memory Usage: " << total_memory << " bytes\n";
    }

    int64_t total_allocations;
    int64_t total_deallocated;
    int64_t total_memory;
    std::vector<std::pair<void*, std::size_t>> allocations;
};

// Global tracking allocator instance
extern TrackingAllocator g_allocator;

void* operator new(std::size_t size);
void operator delete(void* ptr) noexcept;

class BenchmarkMemoryManager : public benchmark::MemoryManager {
  public:
    void Start() override { g_allocator.reset(); }
    void Stop(Result& result) override
    {
        result.num_allocs = g_allocator.total_allocations;
        result.max_bytes_used = g_allocator.current_memory_usage();
    }
};
