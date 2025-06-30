#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <ranges>
#include <stdexcept>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bitwise.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void BitwiseTraceBuilder::process(const simulation::EventEmitterInterface<simulation::BitwiseEvent>::Container& events,
                                  TraceContainer& trace)
{
    using C = Column;

    // We activate last selector in the extra pre-pended row (to support shift)
    trace.set(C::bitwise_last, 0, 1);

    uint32_t row = 1;
    for (const auto& event : events) {
        auto tag = event.a.get_tag();
        const auto start_ctr = get_tag_bytes(tag);

        // We start with full inputs and output and we shift
        // them byte-per-byte to the right.
        uint128_t input_a = static_cast<uint128_t>(event.a.as_ff());
        uint128_t input_b = static_cast<uint128_t>(event.b.as_ff());
        uint128_t output_c = event.res;

        bool is_tag_ff = event.a.get_tag() == ValueTag::FF;
        bool is_tag_mismatch = event.a.get_tag() != event.b.get_tag();
        // For tag_a != FF
        FF tag_a_inv = is_tag_ff ? FF(0) : FF(static_cast<uint8_t>(event.a.get_tag())).invert();
        // For tag_a != tag_b
        FF tag_ab_diff_inv =
            is_tag_mismatch
                ? FF(static_cast<uint8_t>(event.a.get_tag()) - static_cast<uint8_t>(event.b.get_tag())).invert()
                : FF(0);

        // Error Handling: Ensure that the memory tags of the inputs are the same
        if (is_tag_ff || is_tag_mismatch) {
            trace.set(row,
                      { {
                          { C::bitwise_sel, 1 },
                          { C::bitwise_sel_no_err, 0 },
                          { C::bitwise_op_id, static_cast<uint8_t>(event.operation) },
                          { C::bitwise_ctr, start_ctr },
                          { C::bitwise_ctr_inv, FF(start_ctr).invert() },
                          { C::bitwise_start, 1 },
                          { C::bitwise_acc_ia, uint256_t::from_uint128(input_a) },
                          { C::bitwise_acc_ib, uint256_t::from_uint128(input_b) },
                          { C::bitwise_acc_ic, uint256_t::from_uint128(output_c) },
                          { C::bitwise_tag_a, static_cast<uint8_t>(event.a.get_tag()) },
                          { C::bitwise_tag_b, static_cast<uint8_t>(event.b.get_tag()) },
                          { C::bitwise_tag_c, static_cast<uint8_t>(event.a.get_tag()) }, // same as tag_a
                          // Err Flags
                          { C::bitwise_sel_tag_ff_err, is_tag_ff ? 1 : 0 },
                          { C::bitwise_sel_tag_mismatch_err, is_tag_mismatch ? 1 : 0 },
                          { C::bitwise_err, 1 },
                          // Err Helpers
                          { C::bitwise_tag_a_inv, tag_a_inv },
                          { C::bitwise_tag_ab_diff_inv, tag_ab_diff_inv },

                      } });
            row++;
            continue; // Skip the rest of the processing for this event
        }

        // Note that for tag U1, we take only one bit. This is correctly
        // captured below since input_a/b and output_c are each a single bit
        // and the byte mask correctly extracts it.
        const uint128_t mask_low_byte = (1 << 8) - 1;

        for (int ctr = start_ctr; ctr > 0; ctr--) {
            trace.set(row,
                      { { { C::bitwise_op_id, static_cast<uint8_t>(event.operation) },
                          { C::bitwise_acc_ia, uint256_t::from_uint128(input_a) },
                          { C::bitwise_acc_ib, uint256_t::from_uint128(input_b) },
                          { C::bitwise_acc_ic, uint256_t::from_uint128(output_c) },
                          { C::bitwise_ia_byte, uint256_t::from_uint128(input_a & mask_low_byte) },
                          { C::bitwise_ib_byte, uint256_t::from_uint128(input_b & mask_low_byte) },
                          { C::bitwise_ic_byte, uint256_t::from_uint128(output_c & mask_low_byte) },
                          { C::bitwise_tag_a, static_cast<uint8_t>(event.a.get_tag()) },
                          { C::bitwise_tag_b, static_cast<uint8_t>(event.b.get_tag()) },
                          { C::bitwise_tag_c, static_cast<uint8_t>(event.a.get_tag()) }, // same as tag_a
                          { C::bitwise_ctr, ctr },
                          { C::bitwise_ctr_inv, ctr != 0 ? FF(ctr).invert() : 1 },
                          { C::bitwise_ctr_min_one_inv, ctr != 1 ? FF(ctr - 1).invert() : 1 },
                          { C::bitwise_last, static_cast<uint8_t>(ctr == 1) },
                          { C::bitwise_sel, static_cast<uint8_t>(ctr != 0) },
                          { C::bitwise_sel_no_err, 1 },
                          { C::bitwise_start, static_cast<uint8_t>(ctr == start_ctr) },
                          // Err Helpers
                          { C::bitwise_tag_a_inv, tag_a_inv },
                          { C::bitwise_tag_ab_diff_inv, tag_ab_diff_inv } } });

            input_a >>= 8;
            input_b >>= 8;
            output_c >>= 8;
            row++;
        }
    }
}

const InteractionDefinition BitwiseTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_bitwise_byte_operations_settings, InteractionType::LookupIntoBitwise>()
        .add<lookup_bitwise_integral_tag_length_settings, InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
