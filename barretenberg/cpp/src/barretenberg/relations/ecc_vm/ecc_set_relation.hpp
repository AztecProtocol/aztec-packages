// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class ECCVMSetRelationImpl {
  public:
    using FF = FF_;

    // Domain separation tags for the three tuple families in the set relation grand product.
    // Each tuple family uses a distinct tag multiplied by beta^4 to prevent cross-family collisions.
    // Without these tags, tuples from different families with identical packed values would produce
    // identical fingerprints, allowing cross-family substitution in the multiset equality check.
    static constexpr uint64_t FIRST_TERM_TAG = 1;  // (pc, round, wnaf_slice)
    static constexpr uint64_t SECOND_TERM_TAG = 2; // (pc, P.x, P.y, scalar)
    static constexpr uint64_t THIRD_TERM_TAG = 3;  // (pc, P.x, P.y, msm_size)

    // Named subrelation indices — matches SUBRELATION_PARTIAL_LENGTHS ordering.
    // NOTE: the previous Z_PERM_INIT subrelation (`lagrange_first · z_perm = 0`) was moved
    // to ECCVMShiftableInitRelation as part of centralizing all `lagrange_first · col = 0`
    // pins. The grand product still requires `z_perm[lagrange_first row] = 0` — that
    // initialization is now enforced there.
    enum SubrelationIndex : size_t {
        GRAND_PRODUCT = 0,
        LEFT_SHIFTABLE = 1,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        22, // grand product construction sub-relation
        3,  // left-shiftable polynomial sub-relation
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());
    // prover optimization to allow for skipping the computation of sub-relations at certain points in sumcheck.
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        // For the first accumulator in the set relation, the added-on term is 0 if the following vanishes:
        //
        // `(z_perm + lagrange_first) * numerator_evaluation - (z_perm_shift + lagrange_last) * denominator_evaluation`,
        //
        // i.e., if z_perm is well-formed.
        //
        // For the second accumulator in the set relation, the added-on term is 0 if the following vanishes:
        //
        // `lagrange_last_short * z_perm_shift_short`
        //
        // To know when we can skip this computation (i.e., when it is "automatically" 0), most cases are handled by the
        // condtion `z_perm == z_perf_shift`. In most circumstances, this implies that with overwhelming probability,
        // none of the wire values for the present input are involved in non-trivial copy constraints.
        //
        // There are two other edge-cases we need to check for to know we can skip the computation. First,
        // `transcript_mul` can be 1 even though the multiplication is "degenerate" (and not handled by the MSM table):
        // this holds if either the scalar is 0 or the point is the neutral element. Therefore we force this. Second, we
        // must force lagrange_last == 0.
        return (in.z_perm - in.z_perm_shift).is_zero() && in.transcript_mul.is_zero() && in.lagrange_last.is_zero();
    }

    template <typename Accumulator> static Accumulator convert_to_wnaf(const auto& s0, const auto& s1)
    {
        auto t = s0 + s0;
        t += t;
        t += s1;

        auto naf = t + t - 15;
        return naf;
    }

    inline static auto& get_grand_product_polynomial(auto& input) { return input.z_perm; }
    inline static auto& get_shifted_grand_product_polynomial(auto& input) { return input.z_perm_shift; }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_grand_product_numerator(const AllEntities& in, const Parameters& params);

    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_grand_product_denominator(const AllEntities& in, const Parameters& params);

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMSetRelation = Relation<ECCVMSetRelationImpl<FF>>;

} // namespace bb
