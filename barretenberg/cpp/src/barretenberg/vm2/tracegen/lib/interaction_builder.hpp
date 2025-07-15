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

// We set a dummy value in the inverse column so that the size of the column is right.
// The correct value will be set by the prover.
// TODO(fcarreiro): support expressions.
template <typename LookupSettings> void SetDummyInversesPermutation(TraceContainer& trace)
{
    trace.visit_column(LookupSettings::SRC_SELECTOR,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
    trace.visit_column(LookupSettings::DST_SELECTOR,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
}

template <typename LookupSettings> void SetDummyInverses(TraceContainer& trace)
{
    // TODO(fcarreiro): support expressions.
    const auto src_selector_col = static_cast<Column>(LookupSettings::SRC_SELECTOR_EXPR.column);
    const auto dst_selector_col = static_cast<Column>(LookupSettings::DST_SELECTOR_EXPR.column);

    trace.visit_column(src_selector_col,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
    trace.visit_column(dst_selector_col,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
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
