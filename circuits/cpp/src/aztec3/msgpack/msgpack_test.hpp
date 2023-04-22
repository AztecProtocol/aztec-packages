#pragma once
// Note: heavy header due to serialization logic, don't include outside of tests
#include <barretenberg/msgpack/msgpack_impl.hpp>

#include <iostream>
#include <vector>
#include <algorithm>
#include <cstdint>
#include <cstddef>
#include "msgpack_schema_name.hpp"
#include "msgpack_equality.hpp"

namespace msgpack {
template <typename T, typename... Args> std::string check_memory_span(T* obj, Args*... args)
{
    // Convert the variadic template arguments to a vector of pairs.
    // Each pair contains a pointer (as uintptr_t) and its size.
    std::vector<std::pair<uintptr_t, size_t>> pointers{ { reinterpret_cast<uintptr_t>(args), sizeof(*args) }... };
    // Sort the vector based on the pointer values.
    std::sort(pointers.begin(), pointers.end(), [](const auto& a, const auto& b) { return a.first < b.first; });

    // Check if any of the Args* pointers overlap.
    for (size_t i = 1; i < pointers.size(); ++i) {
        if (pointers[i - 1].first + pointers[i - 1].second > pointers[i].first) {
            return "Overlap in " + msgpack::schema_name<T>() + " ar() params detected!";
        }
    }

    // Check if all Args* pointers exist in T* memory.
    uintptr_t t_start = reinterpret_cast<uintptr_t>(obj);
    uintptr_t t_end = t_start + sizeof(T);
    if (pointers.front().first < t_start || pointers.back().first + pointers.back().second > t_end) {
        return "Some " + msgpack::schema_name<T>() + " ar() params don't exist in object!";
    }

    // Check if all of T* memory is used by the Args* pointers.
    size_t total_size = 0;
    for (const auto& ptr : pointers) {
        total_size += ptr.second;
    }

    if (total_size != sizeof(T)) {
        return "Incomplete " + msgpack::schema_name<T>() + " ar() params! Not all of object specified.";
    }
    return {};
}
template <HasMsgPack T> std::string check_msgpack_method(T& object)
{
    std::string result;
    object.msgpack([&](auto&... keys_and_values) {
        std::apply([&](auto&... values) { result = check_memory_span(&object, &values...); },
                   drop_keys(std::tie(keys_and_values...)));
    });
    return result;
}
template <HasMsgPackFlat T> std::string check_msgpack_method(T& object)
{
    std::string result;
    object.msgpack_flat([&](auto&... values) { result = check_memory_span(&object, &values...); });
    return result;
}
} // namespace msgpack