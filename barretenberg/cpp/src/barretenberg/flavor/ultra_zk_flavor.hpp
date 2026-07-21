// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa_utils.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

/*!
\brief Child class of UltraFlavor that runs with ZK Sumcheck.
\details
Most of the properties of UltraFlavor are inherited without any changes. However, the BATCHED_RELATION_PARTIAL_LENGTH is
incremented by 1, as we are using the sumcheck with disabled rows, where the main Honk relation is multiplied by a sum
of multilinear Lagranges. Additionally, the transcript contains extra elements, such as commitments and evaluations of
Libra polynomials used in Sumcheck to make it ZK, as well as a commitment and an evaluation of a hiding polynomials that
turns the PCS stage ZK.
*/
class UltraZKFlavor : public UltraFlavor {
  public:
    static constexpr bool HasZK = true;

    // gemini_masking_poly: a single committed-witness column added for ZK; not shifted.
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

    // ZK Sumcheck multiplies the main Honk relation by a sum of multilinear Lagranges over the
    // disabled rows; this adds one to the per-round univariate length.
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = UltraFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to UltraZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Switch AllEntities (and downstream containers) to the ZK generated layout, which adds
    // `gemini_masking_poly`. Inherited members keyed off the non-ZK base are overridden below.
    template <typename DataType> using AllEntities = UltraFlavor::AllEntities_<DataType, HasZK>;

    static constexpr size_t NUM_WITNESS_ENTITIES = UltraFlavor::NUM_WITNESS_ENTITIES + NUM_MASKING_POLYNOMIALS;
    static constexpr size_t NUM_ALL_ENTITIES = UltraFlavor::NUM_ALL_ENTITIES + NUM_MASKING_POLYNOMIALS;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = UltraFlavor::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_POLYNOMIALS;

    // Final PCS MSM grows by NUM_LIBRA_COMMITMENTS (3) over the non-ZK shape.
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = CONST_PROOF_SIZE_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_SMALL_IPA_COMMITMENTS;
    }

    using AllValues = UltraFlavor::AllValues_<HasZK>;

    static_assert(gemini_masking_layout_consistent<UltraZKFlavor>(),
                  "UltraZKFlavor gemini masking flag must match its entity layout");

    using ProverPolynomials = UltraFlavor::ProverPolynomials_<HasZK>;
    using PartiallyEvaluatedMultivariates = UltraFlavor::PartiallyEvaluatedMultivariates_<HasZK>;

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;
};

} // namespace bb
