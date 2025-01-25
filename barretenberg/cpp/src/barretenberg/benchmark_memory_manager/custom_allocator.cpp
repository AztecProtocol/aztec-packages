#include "custom_allocator.hpp"
#include <cstdlib>
#include <iostream>

TrackingAllocator g_allocator;

void* TrackingAllocator::allocate(size_t size)
{
    std::lock_guard<std::mutex> lock(mutex_);

    total_allocations++;
    total_memory += size;

    void* ptr = std::malloc(size);
    if (!ptr) {
        throw std::bad_alloc();
    }
    allocations.emplace_back(ptr, size);
    return ptr;
}

void TrackingAllocator::deallocate(void* ptr)
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

void* operator new(size_t size)
{
    return g_allocator.allocate(size);
}

void operator delete(void* ptr) noexcept
{
    g_allocator.deallocate(ptr);
}