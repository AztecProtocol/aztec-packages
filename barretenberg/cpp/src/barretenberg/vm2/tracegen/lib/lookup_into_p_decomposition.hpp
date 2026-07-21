#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoPDecomposition : public IndexedLookupTraceBuilder<LookupSettings> {
  protected:
    using TupleType = typename IndexedLookupTraceBuilder<LookupSettings>::TupleType;
    uint32_t find_in_dst(const TupleType& tup) const override
    {
        static const std::array<uint32_t, NUM_RADIXES> cumulative_p_limb_index = []() {
            std::array<uint32_t, NUM_RADIXES> sums;
            sums[0] = 0;
            for (size_t i = 1; i < NUM_RADIXES; ++i) {
                sums[i] = sums[i - 1] + static_cast<uint32_t>(get_p_limbs_per_radix_size(i - 1));
            }
            return sums;
        }();

        const auto& [radix, limb_index, _] = tup;
        return cumulative_p_limb_index.at(static_cast<size_t>(static_cast<uint64_t>(radix))) +
               static_cast<uint32_t>(limb_index);
    }
};

} // namespace bb::avm2::tracegen
