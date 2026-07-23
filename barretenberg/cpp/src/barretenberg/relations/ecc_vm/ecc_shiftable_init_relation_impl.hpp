// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

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
    using View = typename Accumulator::View;

    const auto lagrange_first = View(in.lagrange_first);
    const auto scaled_lagrange_first = lagrange_first * scaling_factor;

    // ---- Load-bearing  ----

    // Grand product initialization. The set relation's GRAND_PRODUCT subrelation evaluates
    //   (z_perm + lagrange_first) * num - (z_perm_shift + lagrange_last) * den
    // and relies on z_perm at the lagrange_first row being 0, so that the bracketed sum
    // starts at 1. Previously lived as Z_PERM_INIT inside ECCVMSetRelation; centralized
    // here so every direct `lagrange_first · col = 0` constraint sits in one place.
    std::get<Z_PERM_INIT>(accumulator) += scaled_lagrange_first * View(in.z_perm);

    // Anchors the transcript accumulator "empty" flag to true at the lagrange_first row.
    // Cascades through `is_accumulator_empty · transcript_accumulator_{x,y} = 0` in
    // ECCVMTranscriptRelation to also pin both accumulator coordinates to 0 there.
    // Previously lived as ACCUMULATOR_NOT_EMPTY_INIT inside ECCVMTranscriptRelation.
    std::get<TRANSCRIPT_ACCUMULATOR_NOT_EMPTY_INIT>(accumulator) +=
        scaled_lagrange_first * View(in.transcript_accumulator_not_empty);

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
    std::get<PRECOMPUTE_SELECT_INIT>(accumulator) += scaled_lagrange_first * View(in.precompute_select);

    // Without this, a malicious prover can set `transcript_mul = 1` at lagrange_first to
    // inject an extra second-term denominator factor into the set relation (see
    // `point_table_init_write` in ecc_set_relation_impl.hpp). The fingerprint is
    // `(transcript_pc, transcript_Px, transcript_Py, z1|z2)`, all of which the prover
    // controls at the lagrange_first row. No other relation pins `transcript_mul` there:
    // `BOOL_Q_MUL` only ranges it to {0,1}, `PC_UPDATE` is gated off by
    // `is_not_first_row = 0`, and `MSM_COUNT_ZERO_WHEN_NOT_MUL` only constrains
    // `msm_count` from `transcript_mul = 0`, not the other direction.
    std::get<TRANSCRIPT_MUL_INIT>(accumulator) += scaled_lagrange_first * View(in.transcript_mul);

    // Without this, the malicious `transcript_mul = 1` fingerprint above can use an
    // attacker-chosen `transcript_pc` at lagrange_first. The PC_UPDATE comment in
    // ecc_transcript_relation_impl.hpp explicitly says "the value of `pc` in the first
    // row is 0 because `pc` is shiftable" — but the only constraint relying on that
    // statement (PC_UPDATE) is gated by `is_not_first_row`, so it does not enforce it.
    // The corresponding BOUNDARY_MSM_COUNT_AND_PC constraint pins `transcript_pc` at the
    // *last* row (via `lagrange_last`), not at lagrange_first.
    std::get<TRANSCRIPT_PC_INIT>(accumulator) += scaled_lagrange_first * View(in.transcript_pc);

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
    std::get<PRECOMPUTE_SCALAR_SUM_INIT>(accumulator) += scaled_lagrange_first * View(in.precompute_scalar_sum);

    // precompute_dx, dy, tx, ty: only read by ECCVMPointTableRelation (gated by
    // `precompute_select`) and the second-term numerator (gated by `q_transition`).
    std::get<PRECOMPUTE_DX_INIT>(accumulator) += scaled_lagrange_first * View(in.precompute_dx);
    std::get<PRECOMPUTE_DY_INIT>(accumulator) += scaled_lagrange_first * View(in.precompute_dy);
    std::get<PRECOMPUTE_TX_INIT>(accumulator) += scaled_lagrange_first * View(in.precompute_tx);
    std::get<PRECOMPUTE_TY_INIT>(accumulator) += scaled_lagrange_first * View(in.precompute_ty);

    // msm_transition: an honest builder writes 0 at lagrange_first. The third-term
    // multiset emission gated by `msm_transition_shift` in ECCVMSetRelation is
    // explicitly multiplied by `(1 - lagrange_first)`, so a malicious `msm_transition`
    // value there does not perturb the third-term multiset. Pin as DiD.
    std::get<MSM_TRANSITION_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_transition);

    // msm_add / msm_double / msm_skew: gate the MSM ADD/DOUBLE/SKEW subrelations. At the
    // lagrange_first row (honest), all three are 0 and the MSM relations are inert. A
    // malicious flip would activate the relations, but their multiset emissions would
    // have no matching numerator (precompute side is gated off by PRECOMPUTE_SELECT_INIT).
    // Pin as DiD.
    std::get<MSM_ADD_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_add);
    std::get<MSM_DOUBLE_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_double);
    std::get<MSM_SKEW_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_skew);

    // msm_accumulator_x, msm_accumulator_y: read by ADD/DOUBLE/SKEW (gated by their
    // selectors) and by IDLE_ROW_PRESERVES_ACC (gated by `(1 - lagrange_first)`). The
    // accumulator chain at the next row starts fresh via `first_add(offset_generator)`
    // anyway.
    std::get<MSM_ACCUMULATOR_X_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_accumulator_x);
    std::get<MSM_ACCUMULATOR_Y_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_accumulator_y);

    // msm_count, msm_round: read by various MSM subrelations which are all either gated
    // by `q_add + q_double + q_skew` (= 0 at lagrange_first once the three pins above
    // fire) or by `is_not_first_row = 0`.
    std::get<MSM_COUNT_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_count);
    std::get<MSM_ROUND_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_round);

    // msm_add1: ADD1_DECOMPOSITION says `msm_add1 = q_add + q_skew`. Once both are
    // pinned to 0 at lagrange_first, this is redundant — included for explicitness.
    std::get<MSM_ADD1_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_add1);

    // msm_pc: read by MSM_TRANSITION_PC (gated by `is_not_first_row`), the first-term
    // multiset denominator (gated by `add_i = 0` at lagrange_first), and the third-term
    // emission (explicitly gated by `(1 - lagrange_first)`). Pin as DiD.
    std::get<MSM_PC_INIT>(accumulator) += scaled_lagrange_first * View(in.msm_pc);

    // transcript_msm_count: pinned by MSM_COUNT_ZERO_WHEN_NOT_MUL (in
    // ECCVMTranscriptRelation) once TRANSCRIPT_MUL_INIT fires. Included here to make the
    // invariant independent of that cascade.
    std::get<TRANSCRIPT_MSM_COUNT_INIT>(accumulator) += scaled_lagrange_first * View(in.transcript_msm_count);
}

} // namespace bb
