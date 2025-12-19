#pragma once

#include <cstddef>
#include <vector>

// Specialization of std::hash for std::vector<T> to be used as a key in unordered_flat_map.
namespace std {

template <typename T> struct hash<std::vector<T>> {
    size_t operator()(const std::vector<T>& vec) const
    {
        size_t seed = vec.size();
        for (const auto& item : vec) {
            seed ^= std::hash<T>{}(item) + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        }
        return seed;
    }
};

} // namespace std
