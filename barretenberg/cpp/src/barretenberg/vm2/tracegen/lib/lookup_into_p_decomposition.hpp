#pragma once

#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoPDecomposition : public IndexedLookupTraceBuilder<LookupSettings> {
  protected:
    uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const override
    {
        const auto& [radix, limb_index, _] = tup;
        size_t radix_index = static_cast<size_t>(uint64_t(radix));
        uint32_t row = 0;
        for (size_t i = 0; i < radix_index; ++i) {
            row += static_cast<uint32_t>(get_p_limbs_per_radix()[i].size());
        }

        row += static_cast<uint32_t>(limb_index);

        return row;
    }
};

} // namespace bb::avm2::tracegen
