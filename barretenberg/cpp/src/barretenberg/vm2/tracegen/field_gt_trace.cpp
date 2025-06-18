#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_ff_gt.hpp"
#include "barretenberg/vm2/simulation/lib/u256_decomposition.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using simulation::LimbsComparisonWitness;
using simulation::U256Decomposition;

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

        bool sel_gt = true;
        int8_t cmp_rng_ctr = 4;

        auto write_row = [&]() {
            FF cmp_rng_ctr_inv = cmp_rng_ctr > 0 ? FF(cmp_rng_ctr).invert() : FF::zero();
            trace.set(row,
                      { { { C::ff_gt_sel, 1 },
                          { C::ff_gt_a, event.a },
                          { C::ff_gt_b, event.b },
                          { C::ff_gt_result, event.result },
                          { C::ff_gt_sel_gt, sel_gt },
                          { C::ff_gt_constant_128, 128 },
                          // No conversion available from uint128_t to FF. Yikes.
                          { C::ff_gt_a_lo, uint256_t::from_uint128(a_limbs.lo) },
                          { C::ff_gt_a_hi, uint256_t::from_uint128(a_limbs.hi) },
                          { C::ff_gt_p_a_borrow, p_sub_a_witness.borrow },
                          { C::ff_gt_p_sub_a_lo, uint256_t::from_uint128(p_sub_a_witness.lo) },
                          { C::ff_gt_p_sub_a_hi, uint256_t::from_uint128(p_sub_a_witness.hi) },
                          { C::ff_gt_b_lo, uint256_t::from_uint128(b_limbs.lo) },
                          { C::ff_gt_b_hi, uint256_t::from_uint128(b_limbs.hi) },
                          { C::ff_gt_p_b_borrow, p_sub_b_witness.borrow },
                          { C::ff_gt_p_sub_b_lo, uint256_t::from_uint128(p_sub_b_witness.lo) },
                          { C::ff_gt_p_sub_b_hi, uint256_t::from_uint128(p_sub_b_witness.hi) },
                          { C::ff_gt_borrow, res_witness.borrow },
                          { C::ff_gt_res_lo, uint256_t::from_uint128(res_witness.lo) },
                          { C::ff_gt_res_hi, uint256_t::from_uint128(res_witness.hi) },
                          { C::ff_gt_cmp_rng_ctr, cmp_rng_ctr },
                          { C::ff_gt_sel_shift_rng, cmp_rng_ctr > 0 },
                          { C::ff_gt_cmp_rng_ctr_inv, cmp_rng_ctr_inv } } });
        };

        while (cmp_rng_ctr >= 0) {
            write_row();
            row++;

            sel_gt = false;

            // shift the limbs to be range checked
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

            cmp_rng_ctr--;
        }
    }
}

const InteractionDefinition FieldGreaterThanTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_ff_gt_a_lo_range_settings, InteractionType::LookupGeneric>()
        .add<lookup_ff_gt_a_hi_range_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
