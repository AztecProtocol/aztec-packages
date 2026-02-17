// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/constants.hpp"
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
    // This flavor runs with ZK Sumcheck
    static constexpr bool HasZK = true;

    // The number of entities added for ZK (gemini_masking_poly)
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

    // Determine the number of evaluations of Prover and Libra Polynomials that the Prover sends to the Verifier in
    // the rounds of ZK Sumcheck.
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = UltraFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to UltraZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Override AllEntities to use ZK version (includes gemini_masking_poly via MaskingEntities)
    template <typename DataType> using AllEntities = UltraFlavor::AllEntities_<DataType, HasZK>;

    // NUM_WITNESS_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_WITNESS_ENTITIES = UltraFlavor::NUM_WITNESS_ENTITIES + NUM_MASKING_POLYNOMIALS;
    // NUM_ALL_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_ALL_ENTITIES = UltraFlavor::NUM_ALL_ENTITIES + NUM_MASKING_POLYNOMIALS;
    // NUM_UNSHIFTED_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = UltraFlavor::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_POLYNOMIALS;

    // Size of the final PCS MSM for ZK = non-ZK size + NUM_LIBRA_COMMITMENTS (3)
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = CONST_PROOF_SIZE_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
    }

    using AllValues = UltraFlavor::AllValues_<HasZK>;
    using ProverPolynomials = UltraFlavor::ProverPolynomials_<HasZK>;
    using PartiallyEvaluatedMultivariates = UltraFlavor::PartiallyEvaluatedMultivariates_<HasZK>;
    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    // Override ProverUnivariates and ExtendedEdges to include gemini_masking_poly
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;
};
} // namespace bb
