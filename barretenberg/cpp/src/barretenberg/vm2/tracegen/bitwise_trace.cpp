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
        const auto start_ctr = integral_tag_length(tag);

        // We start with full inputs and output and we shift
        // them byte-per-byte to the right.
        uint128_t input_a = static_cast<uint128_t>(event.a.as_ff());
        uint128_t input_b = static_cast<uint128_t>(event.b.as_ff());
        uint128_t output_c = static_cast<uint128_t>(event.res.as_ff());

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
                          { C::bitwise_tag, static_cast<int>(tag) },
                          { C::bitwise_ctr, ctr },
                          { C::bitwise_ctr_inv, ctr != 0 ? FF(ctr).invert() : 1 },
                          { C::bitwise_ctr_min_one_inv, ctr != 1 ? FF(ctr - 1).invert() : 1 },
                          { C::bitwise_last, static_cast<uint8_t>(ctr == 1) },
                          { C::bitwise_sel, static_cast<uint8_t>(ctr != 0) },
                          { C::bitwise_start, static_cast<uint8_t>(ctr == start_ctr) } } });

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
