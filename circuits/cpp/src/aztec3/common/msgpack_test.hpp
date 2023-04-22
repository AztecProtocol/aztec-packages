#pragma once

#include <iostream>
#include <vector>
#include <algorithm>
#include <cstdint>
#include <cstddef>

template <typename T, typename... Args> bool check_memory_span(T* obj, Args*... args)
{
    // Convert the variadic template arguments to a vector of pairs.
    // Each pair contains a pointer (as uintptr_t) and its size.
    std::vector<std::pair<uintptr_t, size_t>> pointers{ { reinterpret_cast<uintptr_t>(args), sizeof(*args) }... };
    j
        // Sort the vector based on the pointer values.
        std::sort(pointers.begin(), pointers.end(), [](const auto& a, const auto& b) { return a.first < b.first; });

    // Check if any of the Args* pointers overlap.
    for (size_t i = 1; i < pointers.size(); ++i) {
        if (pointers[i - 1].first + pointers[i - 1].second > pointers[i].first) {
            return false;
        }
    }

    // Check if all Args* pointers exist in T* memory.
    uintptr_t t_start = reinterpret_cast<uintptr_t>(obj);
    uintptr_t t_end = t_start + sizeof(T);
    if (pointers.front().first < t_start || pointers.back().first + pointers.back().second > t_end) {
        return false;
    }

    // Check if all of T* memory is used by the Args* pointers.
    size_t total_size = 0;
    for (const auto& ptr : pointers) {
        total_size += ptr.second;
    }

    return total_size == sizeof(T);
}
