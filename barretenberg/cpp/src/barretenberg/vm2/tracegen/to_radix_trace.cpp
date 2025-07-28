#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

#include <cassert>
#include <memory>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix_mem.hpp"
#include "barretenberg/vm2/generated/relations/perms_to_radix_mem.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void ToRadixTraceBuilder::process(const simulation::EventEmitterInterface<simulation::ToRadixEvent>::Container& events,
                                  TraceContainer& trace)
{
    using C = Column;

    const auto& p_limbs_per_radix = get_p_limbs_per_radix();

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

void ToRadixTraceBuilder::process_with_memory(
    const simulation::EventEmitterInterface<simulation::ToRadixMemoryEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : events) {

        // Helpers
        uint8_t num_limbs_is_zero = event.limbs.empty() ? 1 : 0;
        FF num_limbs_inv = event.limbs.empty() ? FF(0) : FF(event.limbs.size()).invert();
        uint8_t value_is_zero = event.value == FF(0) ? 1 : 0;
        FF value_inv = event.value == FF(0) ? FF(0) : event.value.invert();

        // Error Handling - Out of Memory Access
        uint64_t dst_addr = static_cast<uint64_t>(event.dst_addr);
        uint64_t max_write_addr = dst_addr + event.limbs.size() - 1;
        bool write_out_of_range = max_write_addr > AVM_HIGHEST_MEM_ADDRESS;

        // Error Handling - Radix Range
        bool invalid_radix = (event.radix < 2 || event.radix > 256);
        bool invalid_bitwise_radix = event.is_output_bits && event.radix != 2;

        // Error Handling - Num Limbs and Value
        bool invalid_num_limbs = event.limbs.empty() && !(event.value == FF(0));

        if (write_out_of_range || invalid_radix) {
            trace.set(row,
                      { {
                          { C::to_radix_mem_sel, 1 },
                          { C::to_radix_mem_start, 1 },
                          { C::to_radix_mem_last, 1 },
                          // Unconditional Inputs
                          { C::to_radix_mem_execution_clk, event.execution_clk },
                          { C::to_radix_mem_space_id, event.space_id },
                          { C::to_radix_mem_dst_addr, dst_addr },
                          { C::to_radix_mem_value_to_decompose, event.value },
                          { C::to_radix_mem_radix, event.radix },
                          { C::to_radix_mem_num_limbs, static_cast<uint32_t>(event.limbs.size()) },
                          { C::to_radix_mem_is_output_bits, event.is_output_bits ? 1 : 0 },
                          // Helpers
                          { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
                          { C::to_radix_mem_max_write_addr, max_write_addr },
                          { C::to_radix_mem_two, 2 },
                          { C::to_radix_mem_two_five_six, 256 },
                          { C::to_radix_mem_sel_num_limbs_is_zero, num_limbs_is_zero },
                          { C::to_radix_mem_num_limbs_inv, num_limbs_inv },
                          { C::to_radix_mem_sel_value_is_zero, value_is_zero },
                          { C::to_radix_mem_value_inv, value_inv },
                          // Error Handling
                          { C::to_radix_mem_sel_dst_out_of_range_err, write_out_of_range },
                          { C::to_radix_mem_sel_radix_lt_2_err, event.radix < 2 },
                          { C::to_radix_mem_sel_radix_gt_256_err, event.radix > 256 },
                          { C::to_radix_mem_sel_invalid_bitwise_radix, invalid_bitwise_radix ? 1 : 0 },
                          { C::to_radix_mem_sel_invalid_num_limbs_err, invalid_num_limbs ? 1 : 0 },
                          { C::to_radix_mem_err, 1 },
                      } });
            row++;
            continue;
        }

        // At this point there are no errors, so we process the limbs
        uint32_t num_limbs = static_cast<uint32_t>(event.limbs.size());
        for (uint32_t i = 0; i < event.limbs.size(); ++i) {
            MemoryValue limb_value = event.limbs[i];
            bool start = i == 0;
            bool last = i == (event.limbs.size() - 1);

            trace.set(
                row,
                { {
                    { C::to_radix_mem_sel, 1 },
                    { C::to_radix_mem_start, start ? 1 : 0 },
                    { C::to_radix_mem_num_limbs_minus_one_inv, num_limbs - 1 == 0 ? 0 : FF(num_limbs - 1).invert() },
                    { C::to_radix_mem_last, last ? 1 : 0 },
                    // Unconditional Inputs
                    { C::to_radix_mem_execution_clk, event.execution_clk },
                    { C::to_radix_mem_space_id, event.space_id },
                    { C::to_radix_mem_dst_addr, dst_addr },
                    { C::to_radix_mem_value_to_decompose, event.value },
                    { C::to_radix_mem_radix, event.radix },
                    { C::to_radix_mem_num_limbs, num_limbs },
                    { C::to_radix_mem_is_output_bits, event.is_output_bits ? 1 : 0 },
                    // Helpers
                    { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
                    { C::to_radix_mem_max_write_addr, max_write_addr },
                    { C::to_radix_mem_two, start ? 2 : 0 },
                    { C::to_radix_mem_two_five_six, start ? 256 : 0 },
                    { C::to_radix_mem_sel_num_limbs_is_zero, start ? num_limbs_is_zero : 0 },
                    { C::to_radix_mem_num_limbs_inv, num_limbs_inv },
                    { C::to_radix_mem_sel_value_is_zero, start ? value_is_zero : 0 },
                    { C::to_radix_mem_value_inv, value_inv },
                    // Output
                    { C::to_radix_mem_sel_should_exec, !event.limbs.empty() ? 1 : 0 },
                    { C::to_radix_mem_limb_index_to_lookup, num_limbs - 1 },
                    { C::to_radix_mem_output_limb_value, limb_value.as_ff() },
                    { C::to_radix_mem_output_tag, static_cast<uint8_t>(limb_value.get_tag()) },
                } });

            num_limbs--; // Decrement the number of limbs
            dst_addr++;  // Increment the destination address for the next limb
            row++;
        }
    }
}

const InteractionDefinition ToRadixTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_to_radix_limb_range_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_to_radix_limb_less_than_radix_range_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_to_radix_fetch_safe_limbs_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_to_radix_fetch_p_limb_settings, InteractionType::LookupIntoPDecomposition>()
        .add<lookup_to_radix_limb_p_diff_range_settings, InteractionType::LookupIntoIndexedByClk>()
        // Mem Aware To Radix
        // GT checks
        .add<lookup_to_radix_mem_check_dst_addr_in_range_settings, InteractionType::LookupGeneric>()
        .add<lookup_to_radix_mem_check_radix_lt_2_settings, InteractionType::LookupGeneric>()
        .add<lookup_to_radix_mem_check_radix_gt_256_settings, InteractionType::LookupGeneric>()
        // Dispatch to To Radix
        .add<lookup_to_radix_mem_input_output_to_radix_settings, InteractionType::LookupGeneric>()
        // Write to Memory (this should be a permutation)
        .add<lookup_to_radix_mem_write_mem_settings, InteractionType::LookupGeneric>()
        // Permutation to execution (should be moved later)
        .add<perm_to_radix_mem_dispatch_exec_to_radix_settings, InteractionType::Permutation>();

} // namespace bb::avm2::tracegen
