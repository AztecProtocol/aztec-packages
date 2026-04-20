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

/**
 * @brief Shared utilities for the three ECCVM set relation grand products.
 * @details The original single ECCVMSetRelation has been split into three independent grand products
 * to reduce the maximum relation degree from 22 to 9 (see #2226).
 */
struct ECCVMSetRelationConstants {
    // Domain separation tags for the three tuple families in the set relation grand product.
    static constexpr uint64_t FIRST_TERM_TAG = 1;  // (pc, round, wnaf_slice)
    static constexpr uint64_t SECOND_TERM_TAG = 2; // (pc, P.x, P.y, scalar)
    static constexpr uint64_t THIRD_TERM_TAG = 3;  // (pc, P.x, P.y, msm_size)

    template <typename Accumulator> static Accumulator convert_to_wnaf(const auto& s0, const auto& s1)
    {
        auto t = s0 + s0;
        t += t;
        t += s1;
        auto naf = t + t - 15;
        return naf;
    }
};

/**
 * @brief Grand product #1: validates multiset equality for (pc, round, wnaf_slice) tuples.
 * @details Numerator source: Precompute table (ECCVMWnafRelation).
 *          Denominator source: MSM table (ECCVMMSMRelation).
 *          Uses an intermediate committed polynomial `den_wnaf_partial` to cache the product of
 *          the first two denominator factors, reducing the grand product degree from 10 to 9.
 *
 * Subrelation partial lengths: {9, 3, 3, 5}
 *   [0] Grand product:           (z_perm + L_first) * NUM - (z_perm_shift + L_last) * DEN
 *   [1] Left-shiftable:          L_last * z_perm_shift
 *   [2] z_perm initialization:   L_first * z_perm
 *   [3] den_wnaf_partial:        den_wnaf_partial - wnaf_out1 * wnaf_out2
 */
template <typename FF_> class ECCVMSetWnafRelationImpl {
  public:
    using FF = FF_;

    enum SubrelationIndex : size_t {
        GRAND_PRODUCT = 0,
        LEFT_SHIFTABLE = 1,
        Z_PERM_INIT = 2,
        DEN_PARTIAL_CONSTRAINT = 3,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        9, // grand product construction sub-relation
        3, // left-shiftable polynomial sub-relation
        3, // z_perm initialization sub-relation
        5  // den_wnaf_partial constraint sub-relation
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.z_perm - in.z_perm_shift).is_zero() && in.lagrange_last.is_zero();
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

template <typename FF> using ECCVMSetWnafRelation = Relation<ECCVMSetWnafRelationImpl<FF>>;

/**
 * @brief Grand product #2: validates multiset equality for (pc, P.x, P.y, scalar) tuples.
 * @details Numerator source: Precompute table (ECCVMWnafRelation, ECCVMPointTableRelation).
 *          Denominator source: Transcript table (ECCVMTranscriptRelation).
 *
 * Subrelation partial lengths: {8, 3, 3}
 *   [0] Grand product:           (z_perm_scalar + L_first) * NUM - (z_perm_scalar_shift + L_last) * DEN
 *   [1] Left-shiftable:          L_last * z_perm_scalar_shift
 *   [2] z_perm initialization:   L_first * z_perm_scalar
 */
template <typename FF_> class ECCVMSetScalarRelationImpl {
  public:
    using FF = FF_;

    enum SubrelationIndex : size_t {
        GRAND_PRODUCT = 0,
        LEFT_SHIFTABLE = 1,
        Z_PERM_INIT = 2,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS{
        8, // grand product construction sub-relation
        3, // left-shiftable polynomial sub-relation
        3  // z_perm initialization sub-relation
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.z_perm_scalar - in.z_perm_scalar_shift).is_zero() && in.transcript_mul.is_zero() &&
               in.lagrange_last.is_zero();
    }

    inline static auto& get_grand_product_polynomial(auto& input) { return input.z_perm_scalar; }
    inline static auto& get_shifted_grand_product_polynomial(auto& input) { return input.z_perm_scalar_shift; }

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

template <typename FF> using ECCVMSetScalarRelation = Relation<ECCVMSetScalarRelationImpl<FF>>;

/**
 * @brief Grand product #3: validates multiset equality for (pc, P.x, P.y, msm_size) tuples.
 * @details Numerator source: MSM table (ECCVMMSMRelation).
 *          Denominator source: Transcript table (ECCVMTranscriptRelation).
 *
 * Subrelation partial lengths: {6, 3, 3}
 *   [0] Grand product:           (z_perm_msm + L_first) * NUM - (z_perm_msm_shift + L_last) * DEN
 *   [1] Left-shiftable:          L_last * z_perm_msm_shift
 *   [2] z_perm initialization:   L_first * z_perm_msm
 */
template <typename FF_> class ECCVMSetMsmRelationImpl {
  public:
    using FF = FF_;

    enum SubrelationIndex : size_t {
        GRAND_PRODUCT = 0,
        LEFT_SHIFTABLE = 1,
        Z_PERM_INIT = 2,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS{
        6, // grand product construction sub-relation
        3, // left-shiftable polynomial sub-relation
        3  // z_perm initialization sub-relation
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.z_perm_msm - in.z_perm_msm_shift).is_zero() && in.lagrange_last.is_zero();
    }

    inline static auto& get_grand_product_polynomial(auto& input) { return input.z_perm_msm; }
    inline static auto& get_shifted_grand_product_polynomial(auto& input) { return input.z_perm_msm_shift; }

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

template <typename FF> using ECCVMSetMsmRelation = Relation<ECCVMSetMsmRelationImpl<FF>>;

} // namespace bb
