#pragma once

#include <vector>

#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class InteractionBuilderInterface {
  public:
    virtual ~InteractionBuilderInterface() = default;
    virtual void process(TraceContainer& trace) = 0;
};

// A concatenate that works with movable objects.
template <typename T> std::vector<T> concatenate_jobs(std::vector<T>&& first, auto&&... rest)
{
    std::vector<T> result = std::move(first);
    result.reserve(first.size() + (rest.size() + ...));
    (std::move(rest.begin(), rest.end(), std::back_inserter(result)), ...);
    return result;
}

} // namespace bb::avm2::tracegen

// Define a hash function for std::array so that it can be used as a key in a std::unordered_map.
template <typename T, size_t SIZE> struct std::hash<std::array<T, SIZE>> {
    inline std::size_t operator()(const std::array<T, SIZE>& arr) const noexcept
    {
        return [&arr]<size_t... Is>(std::index_sequence<Is...>) {
            return bb::utils::hash_as_tuple(arr[Is]...);
        }(std::make_index_sequence<SIZE>{});
    }
};
