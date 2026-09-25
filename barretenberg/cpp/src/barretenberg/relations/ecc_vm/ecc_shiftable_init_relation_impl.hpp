#include "ecc_shiftable_init_relation.hpp"

namespace bb {

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMShiftableInitRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                    const AllEntities& in,
                                                    const Parameters& /*unused*/,
                                                    const FF& scaling_factor)
{
    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;

    const auto view = [](const auto& entity) {
        if constexpr (requires { typename Accumulator::CoefficientAccumulator; }) {
            return typename Accumulator::CoefficientAccumulator(entity);
        } else {
            return typename Accumulator::View(entity);
        }
    };
    const auto scaled_lagrange_first = view(in.lagrange_first) * scaling_factor;
    const auto accumulate_init = [&]<size_t subrelation_idx>(const auto& entity) {
        std::get<subrelation_idx>(accumulator) += Accumulator(scaled_lagrange_first * view(entity));
    };

    // Grand product initialization. The set relation's GRAND_PRODUCT subrelation evaluates
    //   (z_perm + lagrange_first) * num - (z_perm_shift + lagrange_last) * den
    // and relies on z_perm at the lagrange_first row being 0, so that the bracketed sum
    // starts at 1. Previously lived as Z_PERM_INIT inside ECCVMSetRelation; centralized
    // here so every direct `lagrange_first · col = 0` constraint sits in one place.
    accumulate_init.template operator()<Z_PERM_INIT>(in.z_perm);

    // Anchors the transcript accumulator "empty" flag to true at the lagrange_first row.
    // Cascades through `is_accumulator_empty · transcript_accumulator_{x,y} = 0` in
    // ECCVMTranscriptRelation to also pin both accumulator coordinates to 0 there.
    // Previously lived as ACCUMULATOR_NOT_EMPTY_INIT inside ECCVMTranscriptRelation.
    accumulate_init.template operator()<TRANSCRIPT_ACCUMULATOR_NOT_EMPTY_INIT>(in.transcript_accumulator_not_empty);

    // Without this, a malicious prover can set `precompute_select = 1` together with
    // `q_transition = 1` at the lagrange_first row to inject a phantom 1-row scalar whose
    // `precompute_scalar_sum` (an unbounded field element) is then communicated to the
    // transcript-side `z1` via the second-term multiset, breaking the [0, 2^128) bound
    // that `FIRST_SLICE_POSITIVE + SCALAR_SUM_CHECK` are supposed to enforce on `z1`. See
    // ecc_wnaf_relation_impl.hpp for the chain.
    //
    // Once pinned, the existing `INACTIVE_*` constraints in ECCVMWnafRelation cascade:
    // they force `precompute_pc`, `precompute_round`, `q_transition`, and
    // `precompute_s1hi` (with the range constraints) all to 0 at lagrange_first.
    accumulate_init.template operator()<PRECOMPUTE_SELECT_INIT>(in.precompute_select);

    // Keeps the second-term multiset denominator inactive at lagrange_first.
    // BOOL_Q_MUL only makes mul boolean; PC_UPDATE is gated off; and
    // MSM_COUNT_ZERO_WHEN_NOT_MUL constrains msm_count from mul = 0, not conversely.
    // TRANSCRIPT_OP_INIT also forces mul = 0 through opcode decomposition and boolean
    // constraints; retain this direct pin to make the multiset boundary explicit.
    accumulate_init.template operator()<TRANSCRIPT_MUL_INIT>(in.transcript_mul);

    // Shiftability only pins row 0, not TRACE_OFFSET. PC_UPDATE is gated off here by
    // is_not_first_row, and BOUNDARY_MSM_COUNT_AND_PC pins only the last row.
    // This pin fixes the first-row PC, including its second-term multiset fingerprint.
    accumulate_init.template operator()<TRANSCRIPT_PC_INIT>(in.transcript_pc);

    // ---- Defense-in-depth ----
    //
    // The following columns have witness values at the lagrange_first row that are not
    // currently read by any firing constraint (their reads are gated off by
    // `precompute_select = 0`, `q_*` selectors = 0, `is_not_first_row = 0`, or by
    // `(1 - lagrange_first)` factors). We pin them here as an invariant rather than
    // relying on the absence of a read, so that future relation changes cannot silently
    // turn a now-unread column into a read at lagrange_first.

    // precompute_scalar_sum: only read by SCALAR_SUM_CHECK (gated by `precompute_select`)
    // and the second-term numerator (gated by `precompute_point_transition`), both 0 at
    // lagrange_first once PRECOMPUTE_SELECT_INIT fires.
    accumulate_init.template operator()<PRECOMPUTE_SCALAR_SUM_INIT>(in.precompute_scalar_sum);

    // precompute_dx, dy, tx, ty: only read by ECCVMPointTableRelation (gated by
    // `precompute_select`) and the second-term numerator (gated by `q_transition`).
    accumulate_init.template operator()<PRECOMPUTE_DX_INIT>(in.precompute_dx);
    accumulate_init.template operator()<PRECOMPUTE_DY_INIT>(in.precompute_dy);
    accumulate_init.template operator()<PRECOMPUTE_TX_INIT>(in.precompute_tx);
    accumulate_init.template operator()<PRECOMPUTE_TY_INIT>(in.precompute_ty);

    // msm_transition: an honest builder writes 0 at lagrange_first. The third-term
    // multiset emission gated by `msm_transition_shift` in ECCVMSetRelation is
    // explicitly multiplied by `(1 - lagrange_first)`, so a malicious `msm_transition`
    // value there does not perturb the third-term multiset. Pin as DiD.
    accumulate_init.template operator()<MSM_TRANSITION_INIT>(in.msm_transition);

    // msm_add / msm_double / msm_skew: gate the MSM ADD/DOUBLE/SKEW subrelations. At the
    // lagrange_first row (honest), all three are 0 and the MSM relations are inert. A
    // malicious flip would activate the relations, but their multiset emissions would
    // have no matching numerator (precompute side is gated off by PRECOMPUTE_SELECT_INIT).
    // Pin as DiD.
    accumulate_init.template operator()<MSM_ADD_INIT>(in.msm_add);
    accumulate_init.template operator()<MSM_DOUBLE_INIT>(in.msm_double);
    accumulate_init.template operator()<MSM_SKEW_INIT>(in.msm_skew);

    // msm_accumulator_x, msm_accumulator_y: read by ADD/DOUBLE/SKEW (gated by their
    // selectors) and by IDLE_ROW_PRESERVES_ACC (gated by `(1 - lagrange_first)`). The
    // accumulator chain at the next row starts fresh via `first_add(offset_generator)`
    // anyway.
    accumulate_init.template operator()<MSM_ACCUMULATOR_X_INIT>(in.msm_accumulator_x);
    accumulate_init.template operator()<MSM_ACCUMULATOR_Y_INIT>(in.msm_accumulator_y);

    // msm_count, msm_round: read by various MSM subrelations which are all either gated
    // by `q_add + q_double + q_skew` (= 0 at lagrange_first once the three pins above
    // fire) or by `is_not_first_row = 0`.
    accumulate_init.template operator()<MSM_COUNT_INIT>(in.msm_count);
    accumulate_init.template operator()<MSM_ROUND_INIT>(in.msm_round);

    // msm_add1: ADD1_DECOMPOSITION says `msm_add1 = q_add + q_skew`. Once both are
    // pinned to 0 at lagrange_first, this is redundant — included for explicitness.
    accumulate_init.template operator()<MSM_ADD1_INIT>(in.msm_add1);

    // msm_pc: read by MSM_TRANSITION_PC (gated by `is_not_first_row`), the first-term
    // multiset denominator (gated by `add_i = 0` at lagrange_first), and the third-term
    // emission (explicitly gated by `(1 - lagrange_first)`). Pin as DiD.
    accumulate_init.template operator()<MSM_PC_INIT>(in.msm_pc);

    // transcript_msm_count: pinned by MSM_COUNT_ZERO_WHEN_NOT_MUL (in
    // ECCVMTranscriptRelation) once TRANSCRIPT_MUL_INIT fires. Included here to make the
    // invariant independent of that cascade.
    accumulate_init.template operator()<TRANSCRIPT_MSM_COUNT_INIT>(in.transcript_msm_count);

    // Translation subtracts the masking head and divides by x^(TRACE_OFFSET + 1).
    // The preceding coefficient at TRACE_OFFSET must therefore be zero in each column.
    // The hiding operation at TRACE_OFFSET + 1 is unaffected by these pins.
    accumulate_init.template operator()<TRANSCRIPT_OP_INIT>(in.transcript_op);
    accumulate_init.template operator()<TRANSCRIPT_PX_INIT>(in.transcript_Px);
    accumulate_init.template operator()<TRANSCRIPT_PY_INIT>(in.transcript_Py);
    accumulate_init.template operator()<TRANSCRIPT_Z1_INIT>(in.transcript_z1);
    accumulate_init.template operator()<TRANSCRIPT_Z2_INIT>(in.transcript_z2);
}

} // namespace bb
