#pragma once

#include <cassert>

#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoUnary : public BaseLookupTraceBuilder<LookupSettings> {
  private:
    // This is an efficient implementation of indexing into the precomputed table.
    uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const override
    {
        // clk is the index
        const auto& [clk, _] = tup;
        return static_cast<uint32_t>(clk);
    }
};

} // namespace bb::avm2::tracegen
