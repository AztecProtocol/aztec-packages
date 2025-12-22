#pragma once

#include <memory>
#include <optional>
#include <vector>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/shared_index_cache.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// Helper to generate a tuple type with N const FF& elements.
namespace detail {
template <size_t N, typename = std::make_index_sequence<N>> struct RefTupleHelper;
template <size_t N, size_t... Is> struct RefTupleHelper<N, std::index_sequence<Is...>> {
    template <size_t> using ConstFFRef = const FF&;
    using type = flat_tuple::tuple<ConstFFRef<Is>...>;
};
} // namespace detail
template <size_t N> using RefTuple = typename detail::RefTupleHelper<N>::type;

class InteractionBuilderInterface {
  public:
    virtual ~InteractionBuilderInterface() = default;
    virtual void process(TraceContainer& trace) = 0;
    // Fingerprint of the destination columns.
    // Used to identify jobs that share the same destination columns and prevent them
    // from building the index at the same time.
    virtual size_t get_destination_columns_fingerprint() const { return 0; }
};

// A concatenate that works with movable objects.
template <typename T> std::vector<T> concatenate_jobs(std::vector<T>&& first, auto&&... rest)
{
    std::vector<T> result = std::move(first);
    result.reserve(first.size() + (rest.size() + ...));
    (std::move(rest.begin(), rest.end(), std::back_inserter(result)), ...);
    return result;
}

// Orders jobs to minimize index building contention.
// Jobs with first occurrences of each destination column key come first, followed by jobs that share
// destination column keys with previously seen ones.
// This ordering helps the SharedIndexCache by ensuring that when multiple jobs share
// the same destination, only the first one builds the index while others wait.
void order_jobs_by_destination_columns(std::vector<std::unique_ptr<InteractionBuilderInterface>>& jobs);

} // namespace bb::avm2::tracegen
