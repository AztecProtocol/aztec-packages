#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix_mem.hpp"

namespace bb::avm2::tracegen {

using C = Column;

/**
 * @brief Processes the non-memory aware to_radix subtrace ingesting ToRadixEvent events. The populated number of rows
 *        per event is equal to the number of limbs in the event. Simulation guarantees that the limbs in the event
 *        fully decompose the value (no truncation) but high limbs might be zero.
 *
 * Events have a single flavor: a complete little-endian decomposition with all limbs populated (at least the number
 * of limbs needed to represent the value in the given radix). No error variants exist for this event type.
 *
 * @note Asserts that each event's radix is in range [2, 256].
 *
 * @param events The events of type ToRadixEvent to process.
 * @param trace The trace to populate.
 */
void ToRadixTraceBuilder::process(const simulation::EventEmitterInterface<simulation::ToRadixEvent>::Container& events,
                                  TraceContainer& trace)
{
    const auto& p_limbs_per_radix = get_p_limbs_per_radix();

    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : events) {
        const FF& value = event.value;
        const uint32_t radix = event.radix;
        BB_ASSERT(radix >= 2 && radix <= 256, "Invalid radix");
        const auto& p_limbs = p_limbs_per_radix[static_cast<size_t>(radix)];

        // Number of safe limbs. It means that the first `safe_limbs` limbs will not overflow
        // the field modulus p. The limb at index `safe_limbs` is considered unsafe and we must
        // ensure that the accumulator is under p. Past this point, we have padding limbs that we must
        // assert to be zero in circuit.
        const uint32_t safe_limbs = static_cast<uint32_t>(p_limbs.size()) - 1;

        FF acc = 0;
        FF power = 1;             // Successive powers of the radix. After unsafe limbs, we set it to 0.
        bool found = false;       // Whether the value has been found in the decomposition.
        bool acc_under_p = false; // Whether the accumulator is under p.

        for (uint32_t i = 0; i < event.limbs.size(); ++i) {
            const bool is_padding = i > safe_limbs;
            const uint8_t limb = event.limbs[i]; // Safe access by the precondition that i < event.limbs.size().
            const uint8_t p_limb = is_padding ? 0 : p_limbs[static_cast<size_t>(i)];

            // If the new limb is equal to the p limb, this will not change the boolean value of acc_under_p.
            if (limb != p_limb) {
                acc_under_p = limb < p_limb;
            }

            // Remain 0 if limb == p_limb otherwise will be overwritten below.
            FF limb_p_diff = 0;

            if (limb > p_limb) {
                limb_p_diff = limb - p_limb - 1;
            } else if (limb < p_limb) {
                limb_p_diff = p_limb - limb - 1;
            }

            bool is_unsafe_limb = i == safe_limbs;
            FF safety_diff = FF(i) - FF(safe_limbs);

            acc += power * FF(limb);

            FF rem = value - acc;
            found = rem.is_zero();

            bool end = i == (event.limbs.size() - 1);

            trace.set(row,
                      { {
                          { C::to_radix_sel, 1 },
                          { C::to_radix_value, value },
                          { C::to_radix_radix, radix },
                          { C::to_radix_limb_index, i },
                          { C::to_radix_limb, limb },
                          { C::to_radix_start, i == 0 ? 1 : 0 },
                          { C::to_radix_end, end ? 1 : 0 },
                          { C::to_radix_power, power },
                          { C::to_radix_not_padding_limb, !is_padding ? 1 : 0 },
                          { C::to_radix_acc, acc },
                          { C::to_radix_found, found ? 1 : 0 },
                          { C::to_radix_limb_radix_diff, radix - limb - 1 },
                          { C::to_radix_rem_inverse, rem }, // Will be inverted in batch later
                          { C::to_radix_safe_limbs, safe_limbs },
                          { C::to_radix_is_unsafe_limb, is_unsafe_limb ? 1 : 0 },
                          { C::to_radix_safety_diff_inverse, safety_diff }, // Will be inverted in batch later
                          { C::to_radix_p_limb, p_limb },
                          { C::to_radix_acc_under_p, acc_under_p ? 1 : 0 },
                          { C::to_radix_limb_lt_p, limb < p_limb ? 1 : 0 },
                          { C::to_radix_limb_eq_p, limb == p_limb ? 1 : 0 },
                          { C::to_radix_limb_p_diff, limb_p_diff },
                      } });

            row++;
            if (is_unsafe_limb) {
                power = 0; // Our constraints require that power is 0 after the unsafe limb.
            } else {
                power *= FF(radix);
            }
        }
    }

    // Batch invert the columns.
    trace.invert_columns({ { C::to_radix_safety_diff_inverse, C::to_radix_rem_inverse } });
}

/**
 * @brief Processes the memory aware to_radix subtrace ingesting ToRadixMemoryEvent events. The populated number of rows
 *        per event is equal to event.num_limbs if there is no error and num_limbs is not zero. Otherwise, a single row
 *        is populated.
 *
 * Events are emitted in the following flavors (all from ToRadix::to_be_radix in simulation):
 * - Input validation error: limbs is empty, one of dst_out_of_range / radix_lt_2 / radix_gt_256 /
 *   invalid_bitwise_radix / invalid_num_limbs occurred. Produces 1 row with err=1, input_validation_error=1.
 * - Zero limbs (no error): num_limbs=0 and value=0. limbs is empty. Produces 1 row with last=1.
 * - Truncation error: limbs is populated (BE, size=num_limbs) but the value cannot be fully reconstructed
 *   from the given number of limbs. Produces 1 row with err=1, sel_should_decompose=1, value_found=0.
 * - Success: limbs is populated (BE, size=num_limbs) and the decomposition is complete. Produces num_limbs
 *   rows with memory writes and decomposition lookups.
 *
 * @note Asserts that limbs.size() == num_limbs for events that pass input validation and have num_limbs > 0.
 *
 * @param events The events of type ToRadixMemoryEvent to process.
 * @param trace The trace to populate.
 */
void ToRadixTraceBuilder::process_with_memory(
    const simulation::EventEmitterInterface<simulation::ToRadixMemoryEvent>::Container& events, TraceContainer& trace)
{
    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : events) {
        // Helpers
        const uint32_t num_limbs = event.num_limbs;
        bool num_limbs_is_zero = num_limbs == 0;
        bool value_is_zero = event.value == FF(0);

        // Error Handling - Out of Memory Access
        uint64_t dst_addr = static_cast<uint64_t>(event.dst_addr); // Will be incremented in the loop below.
        uint64_t write_addr_upper_bound = dst_addr + num_limbs;
        bool write_out_of_range = write_addr_upper_bound > AVM_MEMORY_SIZE;

        // Error Handling - Radix Range
        bool invalid_radix = (event.radix < 2 || event.radix > 256);

        // Error Handling - Bitwise Radix
        bool radix_eq_2 = event.radix == 2;
        bool invalid_bitwise_radix = event.is_output_bits && !radix_eq_2;

        // Error Handling - Num Limbs and Value
        bool invalid_num_limbs = num_limbs_is_zero && !value_is_zero;

        info("max_write_addr: ", max_write_addr);
        info("dst_addr: ", event.dst_addr);
        info("num_limbs:", event.num_limbs);
        // Common values for the first row
        trace.set(row,
                  { {
                      { C::to_radix_mem_sel, 1 },
                      { C::to_radix_mem_start, 1 },
                      // Inputs from dispatch to to_radix (see #DISPATCH_TO_TO_RADIX in execution.pil)
                      // must always be set unconditionally.
                      { C::to_radix_mem_execution_clk, event.execution_clk },
                      { C::to_radix_mem_space_id, event.space_id },
                      { C::to_radix_mem_dst_addr, dst_addr },
                      { C::to_radix_mem_value_to_decompose, event.value },
                      { C::to_radix_mem_radix, event.radix },
                      { C::to_radix_mem_num_limbs, num_limbs },
                      { C::to_radix_mem_is_output_bits, event.is_output_bits ? 1 : 0 },
                      // Helpers
                      { C::to_radix_mem_max_mem_size, static_cast<uint64_t>(AVM_MEMORY_SIZE) },
                      { C::to_radix_mem_write_addr_upper_bound, write_addr_upper_bound },
                      { C::to_radix_mem_two, 2 },
                      { C::to_radix_mem_two_five_six, 256 },
                      { C::to_radix_mem_sel_num_limbs_is_zero, num_limbs_is_zero ? 1 : 0 },
                      { C::to_radix_mem_num_limbs_inv, num_limbs }, // Will be inverted in batch later
                      { C::to_radix_mem_sel_value_is_zero, value_is_zero ? 1 : 0 },
                      { C::to_radix_mem_value_inv, event.value }, // Will be inverted in batch later
                      { C::to_radix_mem_sel_radix_eq_2, radix_eq_2 ? 1 : 0 },
                      { C::to_radix_mem_radix_min_two_inv, FF(event.radix) - FF(2) }, // Will be inverted in batch later
                  } });

        // Input validation errors
        if (write_out_of_range || invalid_radix || invalid_bitwise_radix || invalid_num_limbs) {
            trace.set(row,
                      { {
                          { C::to_radix_mem_last, 1 },
                          { C::to_radix_mem_input_validation_error, 1 },
                          { C::to_radix_mem_err, 1 },
                          { C::to_radix_mem_sel_dst_out_of_range_err, write_out_of_range ? 1 : 0 },
                          { C::to_radix_mem_sel_radix_lt_2_err, event.radix < 2 ? 1 : 0 },
                          { C::to_radix_mem_sel_radix_gt_256_err, event.radix > 256 ? 1 : 0 },
                          { C::to_radix_mem_sel_invalid_bitwise_radix, invalid_bitwise_radix ? 1 : 0 },
                      } });
            row++;
            continue;
        }

        // If no error occured, the following invariant must hold (honest simulation):
        BB_ASSERT(event.limbs.size() == static_cast<size_t>(num_limbs), "Number of limbs does not match");

        // From now on, accessing event.limbs[i] for any 0<=i<num_limbs is safe.

        // Num limbs = 0 short circuit
        if (num_limbs == 0) {
            trace.set(row,
                      { {
                          { C::to_radix_mem_last, 1 },
                      } });
            row++;
            continue;
        }

        // At this point, a decomposition has happened, so we can process the limbs.

        // Compute found for the given decomposition
        FF acc = 0;
        FF power = 1;
        std::vector<bool> found(num_limbs, false);
        for (size_t i = 0; i < num_limbs; ++i) {
            // Limbs are BE, we compute found in LE since the to_radix subtrace is little endian
            size_t reverse_index = event.limbs.size() - i - 1;
            FF limb_value = event.limbs[reverse_index].as_ff();
            acc += power * limb_value;
            power *= event.radix;
            found[reverse_index] = acc == event.value;
            // Once `found[reverse_index]` is set to true, it will never be set to false.
            // This is guaranteed by a honest simulation that `limb_value == 0` from this point
            // on and therefore `acc` remains constant.
        }

        // Truncation error. A radix decomposition in the non-memory aware to_radix subtrace is performed.
        const bool truncation_error = (num_limbs != 0) && !found.at(0);

        // We only populate a single row to retrieve `value_found` from the non-memory aware to_radix subtrace
        // at the last limb (little endian) corresponding to the first limb in the big endian decomposition.
        if (truncation_error) {
            trace.set(row,
                      { {
                          { C::to_radix_mem_last, 1 },
                          { C::to_radix_mem_err, 1 },
                          // Decomposition
                          { C::to_radix_mem_sel_should_decompose, 1 },
                          { C::to_radix_mem_limb_index_to_lookup, num_limbs - 1 },
                          { C::to_radix_mem_limb_value, event.limbs[0].as_ff() },
                          // Default C::to_radix_mem_value_found to zero.
                      } });

            row++;
            continue;
        }

        uint32_t remaining_limbs = num_limbs;

        // Base case
        // Here we have the following guarantees:
        // - num_limbs > 0
        // - No error occured
        for (uint32_t i = 0; i < num_limbs; ++i) {
            const MemoryValue& limb_value = event.limbs[i];
            bool last = i == (num_limbs - 1);

            // Note that the following columns at i == 0 were already set above but code is simpler this way:
            // - C::to_radix_mem_sel
            // - C::to_radix_mem_execution_clk
            // - C::to_radix_mem_space_id
            // - C::to_radix_mem_dst_addr
            // - C::to_radix_mem_value_to_decompose
            // - C::to_radix_mem_radix
            // - C::to_radix_mem_num_limbs
            // - C::to_radix_mem_is_output_bits
            trace.set(row,
                      { {
                          { C::to_radix_mem_sel, 1 },
                          { C::to_radix_mem_num_limbs, remaining_limbs },
                          { C::to_radix_mem_num_limbs_minus_one_inv,
                            FF(remaining_limbs - 1) }, // Will be inverted in batch later
                          { C::to_radix_mem_last, last ? 1 : 0 },
                          // Decomposition
                          { C::to_radix_mem_sel_should_decompose, 1 },
                          { C::to_radix_mem_value_to_decompose, event.value },
                          { C::to_radix_mem_limb_index_to_lookup, remaining_limbs - 1 },
                          { C::to_radix_mem_radix, event.radix },
                          { C::to_radix_mem_limb_value, limb_value.as_ff() },
                          { C::to_radix_mem_value_found, found.at(i) ? 1 : 0 },
                          // Memory write
                          { C::to_radix_mem_sel_should_write_mem, 1 },
                          { C::to_radix_mem_execution_clk, event.execution_clk },
                          { C::to_radix_mem_space_id, event.space_id },
                          { C::to_radix_mem_dst_addr, dst_addr },
                          { C::to_radix_mem_output_tag, static_cast<uint8_t>(limb_value.get_tag()) },
                          { C::to_radix_mem_is_output_bits, event.is_output_bits ? 1 : 0 },
                      } });

            remaining_limbs--; // Decrement the number of limbs
            dst_addr++;        // Increment the destination address for the next limb

            row++;
        }
    }

    // Batch invert the columns.
    trace.invert_columns({ {
        C::to_radix_mem_num_limbs_inv,
        C::to_radix_mem_value_inv,
        C::to_radix_mem_num_limbs_minus_one_inv,
        C::to_radix_mem_radix_min_two_inv,
    } });
}

const InteractionDefinition ToRadixTraceBuilder::interactions =
    InteractionDefinition()
        // Non-Memory Aware To Radix (to_radix.pil)
        .add<InteractionType::LookupIntoIndexedByRow, lookup_to_radix_limb_range_settings>()
        .add<InteractionType::LookupIntoIndexedByRow, lookup_to_radix_limb_less_than_radix_range_settings>()
        .add<InteractionType::LookupIntoIndexedByRow, lookup_to_radix_fetch_safe_limbs_settings>()
        .add<InteractionType::LookupIntoPDecomposition, lookup_to_radix_fetch_p_limb_settings>()
        .add<InteractionType::LookupIntoIndexedByRow, lookup_to_radix_limb_p_diff_range_settings>()
        // Mem Aware To Radix (to_radix_mem.pil)
        // GT checks
        .add<InteractionType::LookupGeneric, lookup_to_radix_mem_check_dst_addr_in_range_settings>(C::gt_sel)
        .add<InteractionType::LookupGeneric, lookup_to_radix_mem_check_radix_lt_2_settings>(C::gt_sel)
        .add<InteractionType::LookupGeneric, lookup_to_radix_mem_check_radix_gt_256_settings>(C::gt_sel)
        // Dispatch to To Radix
        // Cannnot be sequential because the non-memory aware to_radix subtrace rows are ordered
        // by the little endian decomposition while the memory aware to_radix subtrace rows are ordered
        // by the big endian decomposition.
        .add<InteractionType::LookupGeneric,
             lookup_to_radix_mem_input_output_to_radix_settings>(); // CANNOT BE SEQUENTIAL!

} // namespace bb::avm2::tracegen
