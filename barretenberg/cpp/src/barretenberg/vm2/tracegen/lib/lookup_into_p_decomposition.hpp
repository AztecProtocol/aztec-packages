#pragma once

#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings> class LookupIntoPDecomposition : public BaseLookupTraceBuilder<LookupSettings> {
  private:
    uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const override
    {
        const auto& [radix, limb_index, _] = tup;
        uint32_t radix_integer = static_cast<uint32_t>(radix);
        uint32_t row = 0;
        for (uint32_t i = 0; i < radix_integer; ++i) {
            row += P_LIMBS_PER_RADIX[i].size();
        }

        row += static_cast<uint32_t>(limb_index);

        std::cout << "looking up row: " << row << " for radix " << radix_integer << std::endl;

        return row;
    }
};

} // namespace bb::avm2::tracegen
