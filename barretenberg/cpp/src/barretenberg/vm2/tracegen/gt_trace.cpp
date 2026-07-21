#include "barretenberg/vm2/tracegen/gt_trace.hpp"

#include <cstdint>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_gt.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Process the greater-than events and populate the relevant columns in the trace.
 *
 * For each event, computes the absolute difference (a - b - 1 if a > b, or b - a otherwise)
 * and the smallest multiple-of-16 bit width that bounds it. Each event produces one trace row
 * with columns: gt_sel, gt_input_a, gt_input_b, gt_res, gt_abs_diff, gt_num_bits.
 *
 * @param events Container of GreaterThanEvent to process.
 * @param trace The trace container to populate with generated rows.
 */
void GreaterThanTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::GreaterThanEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        FF a_ff = FF(event.a);
        FF b_ff = FF(event.b);
        FF abs_diff = event.result ? a_ff - b_ff - 1 : b_ff - a_ff;
        // Compute the bit-size of abs_diff, rounded up to a multiple of 16.
        // This must match the num_bits used in the range check event emitted by simulation
        // so that the #[GT_RANGE] lookup between this trace and range_check succeeds.
        const uint8_t num_bits_bound = static_cast<uint8_t>(static_cast<uint256_t>(abs_diff).get_msb() + 1);
        const uint8_t num_bits_bound_16 =
            static_cast<uint8_t>(((num_bits_bound - 1) / 16 + 1) * 16); // round up to multiple of 16
        trace.set(row,
                  { {
                      { C::gt_sel, 1 },
                      { C::gt_input_a, event.a },
                      { C::gt_input_b, event.b },
                      { C::gt_res, event.result ? 1 : 0 },
                      { C::gt_abs_diff, abs_diff },
                      { C::gt_num_bits, num_bits_bound_16 },
                  } });
        row++;
    };
}

const InteractionDefinition GreaterThanTraceBuilder::interactions =
    InteractionDefinition().add<InteractionType::LookupGeneric, lookup_gt_gt_range_settings>(Column::range_check_sel);

} // namespace bb::avm2::tracegen
