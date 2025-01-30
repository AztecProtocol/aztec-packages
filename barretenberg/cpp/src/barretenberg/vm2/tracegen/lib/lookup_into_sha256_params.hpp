#pragma once

#include <cassert>

#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoSha256Params : public BaseLookupTraceBuilder<LookupSettings> {
  private:
    uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const override
    {
        // clk/row-index is the round constant for the SHA-256 compression algorithm.
        const auto& [clk, _] = tup;
        return static_cast<uint32_t>(clk);
    }
};
} // namespace bb::avm2::tracegen
