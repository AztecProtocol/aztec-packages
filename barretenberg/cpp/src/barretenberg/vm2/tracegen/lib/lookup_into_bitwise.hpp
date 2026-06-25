#pragma once

#include <cstdint>

#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoBitwise : public IndexedLookupTraceBuilder<LookupSettings> {
  protected:
    using TupleType = typename IndexedLookupTraceBuilder<LookupSettings>::TupleType;
    // This is an efficient implementation of indexing into the precomputed table.
    uint32_t find_in_dst(const TupleType& tup) const override
    {
        // row # is derived as:
        //     - input_b: bits 0...7 (0 being LSB)
        //     - input_a: bits 8...15
        const auto& [a, b, c_and, c_or, c_xor] = tup;
        return (static_cast<uint32_t>(a) << 8) | static_cast<uint32_t>(b);
    }
};

} // namespace bb::avm2::tracegen
