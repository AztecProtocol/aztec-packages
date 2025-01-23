#include "custom_allocator.hpp"
#include <cstdlib>
#include <iostream>

TrackingAllocator g_allocator;

void* TrackingAllocator::allocate(size_t size)
{
    total_allocations++;
    total_memory += size;

    void* ptr = std::malloc(size);
    if (!ptr) {
        throw std::bad_alloc();
    }
    allocations.emplace_back(ptr, size); // Add the pointer and its size to the vector
    return ptr;
}

void TrackingAllocator::deallocate(void* ptr)
{
    for (auto it = allocations.begin(); it != allocations.end(); ++it) {
        if (it->first == ptr) {
            total_deallocated++;
            total_memory -= it->second;
            allocations.erase(it); // Remove the allocation from the vector
            std::free(ptr);
            return;
        }
    }
}

void* operator new(size_t size)
{
    // std::cout << "calling overloaded new\n";
    return g_allocator.allocate(size);
}

void operator delete(void* ptr) noexcept
{
    std::cout << "calling overloaded delete\n";
    g_allocator.deallocate(ptr);
}
