#pragma once

#include <cassert>

#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoPowerOf2 : public BaseLookupTraceBuilder<LookupSettings> {
  private:
    // This is an efficient implementation of indexing into the precomputed table.
    uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const override
    {
        // clk/row-index is the exponent for power_of_2 (2^clk)
        const auto& [clk, _] = tup;
        return static_cast<uint32_t>(clk);
    }
};

} // namespace bb::avm2::tracegen
