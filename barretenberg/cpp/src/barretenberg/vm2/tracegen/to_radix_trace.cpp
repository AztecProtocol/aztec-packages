#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

#include <cassert>
#include <memory>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void ToRadixTraceBuilder::process(const simulation::EventEmitterInterface<simulation::ToRadixEvent>::Container& events,
                                  TraceContainer& trace)
{
    using C = Column;

    auto p_limbs_per_radix = get_p_limbs_per_radix();

    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : events) {
        FF value = event.value;
        uint32_t radix = event.radix;
        size_t radix_index = static_cast<size_t>(radix);
        uint32_t safe_limbs = static_cast<uint32_t>(p_limbs_per_radix[radix_index].size()) - 1;

        FF acc = 0;
        FF exponent = 1;
        bool found = false;
        bool acc_under_p = false;

        for (uint32_t i = 0; i < event.limbs.size(); ++i) {
            bool is_padding = i > safe_limbs;
            uint8_t limb = event.limbs[i];
            uint8_t p_limb = is_padding ? 0 : p_limbs_per_radix[radix_index][static_cast<size_t>(i)];

            if (limb != p_limb) {
                acc_under_p = limb < p_limb;
            }
            FF limb_p_diff = limb == p_limb ? 0 : limb > p_limb ? limb - p_limb - 1 : p_limb - limb - 1;

            bool is_unsafe_limb = i == safe_limbs;
            FF safety_diff_inverse = is_unsafe_limb ? FF(0) : (FF(i) - FF(safe_limbs)).invert();

            acc += exponent * limb;

            FF rem = value - acc;
            found = rem == 0;
            FF rem_inverse = found ? 0 : rem.invert();

            bool end = i == (event.limbs.size() - 1);

            trace.set(row,
                      { {
                          { C::to_radix_sel, 1 },
                          { C::to_radix_value, value },
                          { C::to_radix_radix, radix },
                          { C::to_radix_limb_index, i },
                          { C::to_radix_limb, limb },
                          { C::to_radix_start, i == 0 },
                          { C::to_radix_end, end },
                          { C::to_radix_not_end, !end },
                          { C::to_radix_exponent, exponent },
                          { C::to_radix_not_padding_limb, !is_padding },
                          { C::to_radix_acc, acc },
                          { C::to_radix_found, found },
                          { C::to_radix_limb_radix_diff, radix - 1 - limb },
                          { C::to_radix_rem_inverse, rem_inverse },
                          { C::to_radix_safe_limbs, safe_limbs },
                          { C::to_radix_is_unsafe_limb, is_unsafe_limb },
                          { C::to_radix_safety_diff_inverse, safety_diff_inverse },
                          { C::to_radix_p_limb, p_limb },
                          { C::to_radix_acc_under_p, acc_under_p },
                          { C::to_radix_limb_lt_p, limb < p_limb },
                          { C::to_radix_limb_eq_p, limb == p_limb },
                          { C::to_radix_limb_p_diff, limb_p_diff },
                      } });

            row++;
            if (is_unsafe_limb) {
                exponent = 0;
            }
            exponent *= radix;
        }
    }
}

const InteractionDefinition ToRadixTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_to_radix_limb_range_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_to_radix_limb_less_than_radix_range_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_to_radix_fetch_safe_limbs_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_to_radix_fetch_p_limb_settings, InteractionType::LookupIntoPDecomposition>()
        .add<lookup_to_radix_limb_p_diff_range_settings, InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
