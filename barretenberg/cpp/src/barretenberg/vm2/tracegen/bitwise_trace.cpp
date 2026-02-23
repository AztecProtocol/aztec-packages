#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bitwise.hpp"

namespace bb::avm2::tracegen {

void BitwiseTraceBuilder::process(const simulation::EventEmitterInterface<simulation::BitwiseEvent>::Container& events,
                                  TraceContainer& trace)
{
    using C = Column;
    // When the trace is non-empty, we set last=1 at row 0 as a sentinel. This serves two purposes:
    // 1) Skippable condition: ensures `sel + last = 0` does NOT hold, preventing the sub-relation
    //    `last * (1 - last) = 0` from being skipped (which would fail after sumcheck randomization).
    // 2) Boundary breaking: constraints like #[BITW_OP_ID_REL] and #[BITW_ACC_REL_*] use `(1 - last)`
    //    as a guard. At row 0, the shifted columns reference row 1. Without last=1 here, these
    //    constraints would force op_id_0 = op_id_1 and acc_ia_1 = 0, breaking the first event's trace.
    // When there are no events, we must NOT set last=1.
    if (!events.empty()) {
        trace.set(C::bitwise_last, 0, 1);
    }

    // Precomputed inverses ranges from 0 to 16. (for columns bitwise_ctr_inv, bitwise_ctr_min_one_inv)
    static constexpr std::array<FF, 17> precomputed_inverses = [] {
        std::array<FF, 17> inverses{ 0, 1 };
        // skip 0 since it's not invertible, inverse(1) = 1 so we can skip it as well
        for (size_t i = 2; i <= 16; i++) {
            inverses[i] = FF(i).invert();
        }
        return inverses;
    }();

    // Lambda to map the column selector of the op_id.
    const auto get_op_id_column_selector = [](BitwiseOperation op_id) {
        switch (op_id) {
        case BitwiseOperation::AND:
            return C::bitwise_sel_and;
        case BitwiseOperation::OR:
            return C::bitwise_sel_or;
        case BitwiseOperation::XOR:
            return C::bitwise_sel_xor;
        default:
            __builtin_unreachable();
        }
    };

    uint32_t row = 1;
    for (const auto& event : events) {
        auto tag = event.a.get_tag();

        // We start with full inputs and output and we shift
        // them byte-per-byte to the right.
        uint128_t input_a = static_cast<uint128_t>(event.a.as_ff());
        uint128_t input_b = static_cast<uint128_t>(event.b.as_ff());
        uint128_t output_c = event.res;

        // Error Handling, check tag a is FF or tag a != tag b
        bool is_tag_ff = event.a.get_tag() == MemoryTag::FF;
        bool is_tag_mismatch = event.a.get_tag() != event.b.get_tag();
        // For tag_a != FF
        // Rely below on MemoryTag::FF being 0
        static_assert(static_cast<uint8_t>(MemoryTag::FF) == 0);
        const uint8_t tag_a_u8 = static_cast<uint8_t>(event.a.get_tag());
        const uint8_t tag_b_u8 = static_cast<uint8_t>(event.b.get_tag());

        FF tag_a_inv = precomputed_inverses[tag_a_u8];
        // For tag_a != tag_b
        FF tag_ab_diff_inv = 0;
        if (tag_a_u8 > tag_b_u8) {
            tag_ab_diff_inv = precomputed_inverses[tag_a_u8 - tag_b_u8];
        } else {
            // (-x)^(-1) = -x^(-1) for a field element x.
            tag_ab_diff_inv = -precomputed_inverses[tag_b_u8 - tag_a_u8];
        }

        if (is_tag_ff || is_tag_mismatch) {
            // There is an error, fill in values that are still needed to satisfy constraints despite the error.
            trace.set(row,
                      { {
                          { C::bitwise_op_id, static_cast<uint8_t>(event.operation) },
                          { C::bitwise_start, 1 },
                          { C::bitwise_sel_get_ctr, 0 },
                          { C::bitwise_last, 1 }, // Error triggers a last
                          { C::bitwise_acc_ia, event.a.as_ff() },
                          { C::bitwise_acc_ib, event.b.as_ff() },
                          { C::bitwise_acc_ic, output_c },
                          { C::bitwise_ia_byte, event.a.as_ff() },
                          { C::bitwise_ib_byte, event.b.as_ff() },
                          { C::bitwise_ic_byte, output_c },
                          { C::bitwise_tag_a, tag_a_u8 },
                          { C::bitwise_tag_b, tag_b_u8 },
                          { C::bitwise_tag_c, static_cast<uint8_t>(MemoryTag::FF) }, // Since error
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

        // At this point we know that we will not error, so we can proceed with the bitwise operation.

        // Note that for tag U1, we take only one bit. This is correctly
        // captured below since input_a/b and output_c are each a single bit
        // and the byte mask correctly extracts it.
        constexpr uint128_t mask_low_byte = (1 << 8) - 1;
        const auto start_ctr = get_tag_bytes(tag);

        for (int ctr = start_ctr; ctr > 0; ctr--) {
            bool is_start = (ctr == start_ctr);
            uint8_t ia_byte = input_a & mask_low_byte;
            uint8_t ib_byte = input_b & mask_low_byte;
            trace.set(row,
                      { { { C::bitwise_sel, 1 },
                          { get_op_id_column_selector(event.operation), 1 },
                          { C::bitwise_op_id, static_cast<uint8_t>(event.operation) },
                          // It is fine to use the truncated input_a/b here instead of event.a/b because if event.a/b
                          // were FF values we would have taken the error branch above.
                          { C::bitwise_acc_ia, input_a },
                          { C::bitwise_acc_ib, input_b },
                          { C::bitwise_acc_ic, output_c },
                          { C::bitwise_ia_byte, ia_byte },
                          { C::bitwise_ib_byte, ib_byte },
                          { C::bitwise_ic_byte, output_c & mask_low_byte },
                          { C::bitwise_output_and, ia_byte & ib_byte },
                          { C::bitwise_output_or, ia_byte | ib_byte },
                          { C::bitwise_output_xor, ia_byte ^ ib_byte },
                          { C::bitwise_tag_a, is_start ? tag_a_u8 : 0 },
                          { C::bitwise_tag_b, is_start ? tag_b_u8 : 0 },
                          { C::bitwise_tag_c, is_start ? tag_a_u8 : 0 }, // same as tag_a
                          { C::bitwise_ctr, ctr },
                          { C::bitwise_ctr_inv, precomputed_inverses[static_cast<uint8_t>(ctr)] },
                          { C::bitwise_ctr_min_one_inv, precomputed_inverses[static_cast<uint8_t>(ctr - 1)] },
                          { C::bitwise_last, ctr == 1 ? 1 : 0 },
                          { C::bitwise_start, is_start ? 1 : 0 },
                          { C::bitwise_sel_get_ctr, is_start ? 1 : 0 }, // Same as bitwise_start but in non-error case
                          // Err Helpers, in the happy path we still need to prove we would not have errored
                          { C::bitwise_tag_a_inv, is_start ? tag_a_inv : 0 },
                          { C::bitwise_tag_ab_diff_inv, is_start ? tag_ab_diff_inv : 0 } } });

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
        .add<lookup_bitwise_integral_tag_length_settings, InteractionType::LookupIntoIndexedByRow>();

} // namespace bb::avm2::tracegen
