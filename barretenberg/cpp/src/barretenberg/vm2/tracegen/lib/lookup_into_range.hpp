#pragma once

#include <cassert>

#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

/**
 * Lookup trace builder used for lookups that lookup into the clk column, only changing based on a selector.
 * Like basic 8 or 16 bit range checks. Example: `sel { dyn_diff } in precomputed.sel_range_16 { precomputed.clk };`
 */
template <typename LookupSettings> class LookupIntoRange : public BaseLookupTraceBuilder<LookupSettings> {
  private:
    // This is an efficient implementation of indexing into the precomputed table.
    uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const override
    {
        const auto& [clk] = tup;
        return static_cast<uint32_t>(clk);
    }
};

} // namespace bb::avm2::tracegen
