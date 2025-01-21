#pragma once

#include <cassert>

#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoBitwise : public BaseLookupTraceBuilder<LookupSettings> {
  private:
    // This is an efficient implementation of indexing into the precomputed table.
    uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const override
    {
        const auto& [op_id, a, b, _] = tup;
        return (static_cast<uint32_t>(op_id) << static_cast<uint32_t>(16)) | (static_cast<uint32_t>(a) << 8) |
               static_cast<uint32_t>(b);
    }
};

} // namespace bb::avm2::tracegen