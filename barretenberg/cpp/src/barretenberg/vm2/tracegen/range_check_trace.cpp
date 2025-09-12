#include "barretenberg/vm2/tracegen/range_check_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <ranges>
#include <stdexcept>

#include "barretenberg/vm2/generated/relations/lookups_range_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void RangeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::RangeCheckEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        // store off event entries to be used directly in row
        const uint256_t original_num_bits = event.num_bits;
        const uint256_t original_value = uint256_t::from_uint128(event.value);

        // these will be mutated below
        uint8_t num_bits = event.num_bits;
        uint256_t value = uint256_t::from_uint128(event.value);

        std::array<uint16_t, 7> fixed_slice_registers; // u16_r0...6
        size_t index_of_most_sig_16b_chunk = 0;
        uint16_t dynamic_slice_register = 0; // same as u16_r7
        uint8_t dynamic_bits = 0;

        // Split the value into 16-bit chunks
        for (size_t i = 0; i < 8; i++) {
            // The most significant 16-bits have to be placed in the dynamic slice register
            if (num_bits <= 16) {
                dynamic_slice_register = static_cast<uint16_t>(value);
                index_of_most_sig_16b_chunk = i;
                dynamic_bits = num_bits;
                break;
            }
            // We have more chunks of 16-bits to operate on, so set the ith fixed register
            fixed_slice_registers[i] = static_cast<uint16_t>(value);
            num_bits -= 16;
            value >>= 16;
        }

        auto dynamic_diff = static_cast<uint16_t>((1 << dynamic_bits) - dynamic_slice_register - 1);

        trace.set(row,
                  { {
                      { C::range_check_sel, 1 },
                      // value to range check
                      { C::range_check_value, original_value },
                      // number of bits to check the value against
                      { C::range_check_rng_chk_bits, original_num_bits },
                      // flag indicating which bit size range is active
                      { C::range_check_is_lte_u16, index_of_most_sig_16b_chunk == 0 ? 1 : 0 },
                      { C::range_check_is_lte_u32, index_of_most_sig_16b_chunk == 1 ? 1 : 0 },
                      { C::range_check_is_lte_u48, index_of_most_sig_16b_chunk == 2 ? 1 : 0 },
                      { C::range_check_is_lte_u64, index_of_most_sig_16b_chunk == 3 ? 1 : 0 },
                      { C::range_check_is_lte_u80, index_of_most_sig_16b_chunk == 4 ? 1 : 0 },
                      { C::range_check_is_lte_u96, index_of_most_sig_16b_chunk == 5 ? 1 : 0 },
                      { C::range_check_is_lte_u112, index_of_most_sig_16b_chunk == 6 ? 1 : 0 },
                      { C::range_check_is_lte_u128, index_of_most_sig_16b_chunk == 7 ? 1 : 0 },
                      // slice registers
                      { C::range_check_u16_r0, fixed_slice_registers[0] },
                      { C::range_check_u16_r1, fixed_slice_registers[1] },
                      { C::range_check_u16_r2, fixed_slice_registers[2] },
                      { C::range_check_u16_r3, fixed_slice_registers[3] },
                      { C::range_check_u16_r4, fixed_slice_registers[4] },
                      { C::range_check_u16_r5, fixed_slice_registers[5] },
                      { C::range_check_u16_r6, fixed_slice_registers[6] },
                      { C::range_check_u16_r7, dynamic_slice_register },
                      // computations on dynamic slice register
                      { C::range_check_dyn_rng_chk_bits, dynamic_bits },
                      { C::range_check_dyn_rng_chk_pow_2, 1 << dynamic_bits },
                      { C::range_check_dyn_diff, dynamic_diff },
                      // Lookup selectors
                      { C::range_check_sel_r0_16_bit_rng_lookup, index_of_most_sig_16b_chunk > 0 ? 1 : 0 },
                      { C::range_check_sel_r1_16_bit_rng_lookup, index_of_most_sig_16b_chunk > 1 ? 1 : 0 },
                      { C::range_check_sel_r2_16_bit_rng_lookup, index_of_most_sig_16b_chunk > 2 ? 1 : 0 },
                      { C::range_check_sel_r3_16_bit_rng_lookup, index_of_most_sig_16b_chunk > 3 ? 1 : 0 },
                      { C::range_check_sel_r4_16_bit_rng_lookup, index_of_most_sig_16b_chunk > 4 ? 1 : 0 },
                      { C::range_check_sel_r5_16_bit_rng_lookup, index_of_most_sig_16b_chunk > 5 ? 1 : 0 },
                      { C::range_check_sel_r6_16_bit_rng_lookup, index_of_most_sig_16b_chunk > 6 ? 1 : 0 },
                  } });

        row++;
    }
}

const InteractionDefinition RangeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_range_check_dyn_diff_is_u16_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_dyn_rng_chk_pow_2_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_r0_is_u16_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_r1_is_u16_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_r2_is_u16_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_r3_is_u16_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_r4_is_u16_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_r5_is_u16_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_r6_is_u16_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_range_check_r7_is_u16_settings, InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
