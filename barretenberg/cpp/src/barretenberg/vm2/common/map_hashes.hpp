#pragma once

#include <cstddef>
#include <functional>
#include <vector>

#include "barretenberg/common/tuple.hpp"
#include "barretenberg/common/utils.hpp"

// Specialization of std::hash for std::vector<T> to be used as a key in unordered_flat_map.
namespace std {

template <typename T> struct hash<std::reference_wrapper<const T>> {
    size_t operator()(const std::reference_wrapper<const T>& ref) const { return std::hash<T>{}(ref.get()); }
};

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

// Define a hash function for std::array so that it can be used as a key in a std::unordered_map.
template <typename T, size_t SIZE> struct hash<std::array<T, SIZE>> {
    inline std::size_t operator()(const std::array<T, SIZE>& arr) const noexcept
    {
        return [&arr]<size_t... Is>(std::index_sequence<Is...>) {
            return bb::utils::hash_as_tuple(arr[Is]...);
        }(std::make_index_sequence<SIZE>{});
    }
};

// Define a hash function for flat_tuple::tuple so that it can be used as a key in a std::unordered_map.
template <typename... Ts> struct hash<bb::flat_tuple::tuple<Ts...>> {
    inline std::size_t operator()(const bb::flat_tuple::tuple<Ts...>& tup) const noexcept
    {
        return bb::flat_tuple::apply([](const auto&... args) { return bb::utils::hash_as_tuple(args...); }, tup);
    }
};

} // namespace std
