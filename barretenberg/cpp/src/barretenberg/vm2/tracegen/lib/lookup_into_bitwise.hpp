#pragma once

#include <cassert>

#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoBitwise : public IndexedLookupTraceBuilder<LookupSettings> {
  protected:
    // This is an efficient implementation of indexing into the precomputed table.
    uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const override
    {
        // row # is derived as:
        //     - input_b: bits 0...7 (0 being LSB)
        //     - input_a: bits 8...15
        //     - op_id: bits 16...
        // In other words, the first 256*256 rows are for op_id 0. Next are for op_id 1, followed by op_id 2.
        const auto& [op_id, a, b, _] = tup;
        return (static_cast<uint32_t>(op_id) << static_cast<uint32_t>(16)) | (static_cast<uint32_t>(a) << 8) |
               static_cast<uint32_t>(b);
    }
};

} // namespace bb::avm2::tracegen
