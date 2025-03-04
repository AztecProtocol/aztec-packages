#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/ecc.hpp"
#include "barretenberg/vm2/tracegen/to_radix.hpp"
#include <cassert>

namespace bb::avm2::tracegen {

namespace {
uint32_t compute_safe_limbs(uint32_t radix)
{
    FF exponent = 1;
    uint32_t safe_limbs = 0;
    while (true) {
        FF new_exponent = exponent * radix;
        if (static_cast<uint256_t>(new_exponent) < static_cast<uint256_t>(exponent)) {
            // Wrapped around
            return safe_limbs;
        }
        safe_limbs++;
        exponent = new_exponent;
    }
}
} // namespace

void ToRadixTraceBuilder::process(const simulation::EventEmitterInterface<simulation::ToRadixEvent>::Container& events,
                                  TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : events) {
        FF value = event.value;
        uint32_t radix = event.radix;
        uint32_t safe_limbs = compute_safe_limbs(radix);
        FF acc = 0;
        FF exponent = 1;
        bool found = false;

        for (uint32_t i = 0; i < event.limbs.size(); ++i) {
            uint8_t limb = event.limbs[i];
            bool is_unsafe_limb = i >= safe_limbs;

            acc += exponent * limb;

            FF rem = value - acc;
            found = rem == 0;
            FF rem_inverse = found ? 0 : rem.invert();

            uint32_t limb_index_safe_limbs_comparison_hint = is_unsafe_limb ? i - safe_limbs : safe_limbs - 1 - i;

            bool end = i == (event.limbs.size() - 1);

            assert(!end || found);

            trace.set(row,
                      { { { C::to_radix_sel, 1 },
                          { C::to_radix_value, value },
                          { C::to_radix_radix, radix },
                          { C::to_radix_limb, limb },
                          { C::to_radix_limb_index, i },
                          { C::to_radix_acc, acc },
                          { C::to_radix_exponent, exponent },
                          { C::to_radix_found, found },
                          { C::to_radix_safe_limbs, safe_limbs },
                          { C::to_radix_is_unsafe_limb, is_unsafe_limb },
                          { C::to_radix_start, i == 0 },
                          { C::to_radix_end, end },
                          { C::to_radix_not_end, !end },
                          { C::to_radix_limb_radix_diff, radix - 1 - limb },
                          { C::to_radix_rem_inverse, rem_inverse },
                          { C::to_radix_limb_index_safe_limbs_comparison_hint, limb_index_safe_limbs_comparison_hint },
                          { C::to_radix_assert_gt_lookup, !end && !found && safe_limbs == (i + 1) } } });

            row++;
            if (is_unsafe_limb) {
                exponent = 0;
            }
            exponent *= radix;
        }
    }
}

} // namespace bb::avm2::tracegen
