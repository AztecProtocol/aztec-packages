#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_ff_gt.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using simulation::LimbsComparisonWitness;
using simulation::U256Decomposition;

/**
 * @brief Processes FieldGreaterThanEvent events and generates trace rows for the ff_gt gadget.
 *
 * This function handles two flavors of FieldGreaterThanEvent:
 *
 * 1. **GT Operation** (operation == GREATER_THAN):
 *    - Generates 5 rows total (1 initial + 4 shift rows)
 *    - First row: Sets sel_gt=1, populates all fields (a, b, result, decompositions, witnesses)
 *    - Rows 2-5: Shift rows with sel_shift_rng=1, performing pairwise range checks via shifting
 *    - All event fields are populated (a_limbs, b_limbs, p_sub_a_witness, p_sub_b_witness, res_witness)
 *    - cmp_rng_ctr initialized to 4 and decrements to 0
 *
 * 2. **Canonical Decomposition** (operation == CANONICAL_DECOMPOSITION):
 *    - Generates 2 rows total (1 initial + 1 shift row)
 *    - First row: Sets sel_dec=1, populates a-related fields (a, a_limbs, p_sub_a_witness)
 *    - Row 2: Shift row with sel_shift_rng=1, performs remaining range checks
 *    - Only a-related fields are meaningful; b-related and result fields have default values
 *    - cmp_rng_ctr initialized to 1 and decrements to 0
 *
 * The shifting mechanism ensures all 128-bit limbs are range-checked:
 * - Each row performs 2 x 128-bit range checks on a_lo and a_hi columns
 * - Values shift left across columns: p_sub_a → a, b → p_sub_a, p_sub_b → b, res → p_sub_b
 * - After all shifts, all 10 limbs (GT) or 4 limbs (decomp) have been range-checked
 *
 * @param events Container of FieldGreaterThanEvent to process.
 * @param trace The trace container to populate with generated rows.
 *
 * @note Row indices start at 1 (row 0 is always empty when there are shifts).
 * @note The sel column is set to 1 for all rows in a gadget block (initial + shift rows).
 * @note Selectors sel_gt and sel_dec are only set on the first row of each gadget invocation.
 */
void FieldGreaterThanTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::FieldGreaterThanEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 1;
    for (const auto& event : events) {
        // Copy the things that will need range checks since we'll mutate them in the shifts
        U256Decomposition a_limbs = event.a_limbs;
        LimbsComparisonWitness p_sub_a_witness = event.p_sub_a_witness;
        U256Decomposition b_limbs = event.b_limbs;
        LimbsComparisonWitness p_sub_b_witness = event.p_sub_b_witness;
        LimbsComparisonWitness res_witness = event.res_witness;

        bool sel_gt = event.operation == simulation::FieldGreaterOperation::GREATER_THAN;
        bool sel_dec = event.operation == simulation::FieldGreaterOperation::CANONICAL_DECOMPOSITION;

        int init_ctr = sel_gt ? 4 : 1;

        for (int cmp_rng_ctr = init_ctr; cmp_rng_ctr >= 0; cmp_rng_ctr--) {

            bool is_end = (cmp_rng_ctr == 0);
            trace.set(row,
                      { { { C::ff_gt_sel, 1 },
                          { C::ff_gt_a, event.a },
                          { C::ff_gt_b, event.b },
                          { C::ff_gt_result, event.gt_result },
                          { C::ff_gt_sel_dec, sel_dec ? 1 : 0 },
                          { C::ff_gt_sel_gt, sel_gt ? 1 : 0 },
                          { C::ff_gt_end, is_end ? 1 : 0 },
                          { C::ff_gt_constant_128, 128 },
                          { C::ff_gt_a_lo, a_limbs.lo },
                          { C::ff_gt_a_hi, a_limbs.hi },
                          { C::ff_gt_p_a_borrow, p_sub_a_witness.borrow ? 1 : 0 },
                          { C::ff_gt_p_sub_a_lo, p_sub_a_witness.lo },
                          { C::ff_gt_p_sub_a_hi, p_sub_a_witness.hi },
                          { C::ff_gt_b_lo, b_limbs.lo },
                          { C::ff_gt_b_hi, b_limbs.hi },
                          { C::ff_gt_p_b_borrow, p_sub_b_witness.borrow ? 1 : 0 },
                          { C::ff_gt_p_sub_b_lo, p_sub_b_witness.lo },
                          { C::ff_gt_p_sub_b_hi, p_sub_b_witness.hi },
                          { C::ff_gt_borrow, res_witness.borrow ? 1 : 0 },
                          { C::ff_gt_res_lo, res_witness.lo },
                          { C::ff_gt_res_hi, res_witness.hi },
                          { C::ff_gt_cmp_rng_ctr, cmp_rng_ctr } } });

            row++;

            // After the first row, sel_gt and sel_dec are no longer active.
            // Subsequent rows are shift rows for completing the range checks.
            sel_gt = false;
            sel_dec = false;

            // Shift the limbs left for range checking in the next row.
            // The shifting pattern ensures all limbs are eventually range-checked via a_lo and a_hi columns:
            //   p_sub_a → a_limbs
            //   b_limbs → p_sub_a_witness
            //   p_sub_b_witness → b_limbs
            //   res_witness → p_sub_b_witness
            // This corresponds to the PIL shift constraints (SHIFT_P_SUB_A_TO_A_LO, etc.)
            a_limbs.lo = p_sub_a_witness.lo;
            a_limbs.hi = p_sub_a_witness.hi;
            p_sub_a_witness.lo = b_limbs.lo;
            p_sub_a_witness.hi = b_limbs.hi;
            b_limbs.lo = p_sub_b_witness.lo;
            b_limbs.hi = p_sub_b_witness.hi;
            p_sub_b_witness.lo = res_witness.lo;
            p_sub_b_witness.hi = res_witness.hi;
            res_witness.lo = 0;
            res_witness.hi = 0;
        }
    }
}

const InteractionDefinition FieldGreaterThanTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupGeneric, lookup_ff_gt_a_lo_range_settings>()
        .add<InteractionType::LookupGeneric, lookup_ff_gt_a_hi_range_settings>();

} // namespace bb::avm2::tracegen
