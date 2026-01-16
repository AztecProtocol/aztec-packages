#pragma once

#include <cassert>

#include "barretenberg/common/tuple.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

/**
 * Lookup trace builder used for lookups that lookup into tuples which are indexed by clk,
 * i.e., whose first tuple element is clk column.
 * For instance, with a tuple of size 1 we have the basic 8 or 16 bit range checks.
 * Example: `sel { dyn_diff } in precomputed.sel_range_16 {precomputed.clk };`
 * An example with a size 2 tuple (p denotes precomputed):
 * start {tag, ctr} in p.sel_tag_parameters {p.clk, p.tag_byte_length};
 */
template <typename LookupSettings> class LookupIntoIndexedByClk : public IndexedLookupTraceBuilder<LookupSettings> {
  protected:
    using TupleType = typename IndexedLookupTraceBuilder<LookupSettings>::TupleType;
    // This is an efficient implementation of indexing into the precomputed table.
    uint32_t find_in_dst(const TupleType& tup) const override { return static_cast<uint32_t>(flat_tuple::get<0>(tup)); }
};

} // namespace bb::avm2::tracegen
