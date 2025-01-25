#include "custom_allocator.hpp"
#include <cstdlib>
#include <iostream>

TrackingAllocator g_allocator;

void* TrackingAllocator::malloc(size_t size)
{
    std::lock_guard<std::mutex> lock(mutex_);

    total_allocations++;
    total_memory += size;
    max_memory = std::max(max_memory, total_memory);

    void* ptr = std::malloc(size);
    if (!ptr) {
        throw std::bad_alloc();
    }
    allocations.emplace_back(ptr, size);
    return ptr;
}

void TrackingAllocator::free(void* ptr)
{
    std::lock_guard<std::mutex> lock(mutex_);

    for (auto it = allocations.begin(); it != allocations.end(); ++it) {
        if (it->first == ptr) {
            total_deallocated++;
            total_memory -= it->second;
            allocations.erase(it);
            std::free(ptr);
            return;
        }
    }

    // Optional: handle unknown pointer
    std::cerr << "Warning: Attempting to free unknown pointer" << std::endl;
}

// Override malloc
void* malloc(size_t size)
{
    return g_allocator.malloc(size);
}

// Override free
void free(void* ptr)
{
    g_allocator.free(ptr);
}