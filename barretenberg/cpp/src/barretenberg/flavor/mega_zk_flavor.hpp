// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"

namespace bb {

/*!
\brief Child class of MegaFlavor that runs with ZK Sumcheck.
 See more in \ref docs/src/sumcheck-outline.md "Sumcheck Outline".
*/
class MegaZKFlavor : public bb::MegaFlavor {
  public:
    // MegaZK is only used in production to prove the Hiding Kernel
    static constexpr size_t VIRTUAL_LOG_N = HIDING_KERNEL_LOG_N;

    // Indicates that this flavor runs with ZK Sumcheck.
    static constexpr bool HasZK = true;

    // The number of entities added for ZK (gemini_masking_poly)
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

    // The degree has to be increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MegaFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to MegaZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Override AllEntities to use ZK version (includes gemini_masking_poly via MaskingEntities)
    template <typename DataType> using AllEntities = MegaFlavor::AllEntities_<DataType, HasZK>;

    // NUM_WITNESS_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaFlavor::NUM_WITNESS_ENTITIES + NUM_MASKING_POLYNOMIALS;
    // NUM_ALL_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_ALL_ENTITIES = MegaFlavor::NUM_ALL_ENTITIES + NUM_MASKING_POLYNOMIALS;
    // NUM_UNSHIFTED_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaFlavor::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_POLYNOMIALS;

    // Size of the final PCS MSM for ZK = non-ZK size + NUM_LIBRA_COMMITMENTS (3)
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = MegaFlavor::VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
    }

    using AllValues = MegaFlavor::AllValues_<HasZK>;
    using ProverPolynomials = MegaFlavor::ProverPolynomials_<HasZK>;
    using PartiallyEvaluatedMultivariates = MegaFlavor::PartiallyEvaluatedMultivariates_<HasZK>;
    using VerifierCommitments = MegaFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    // Override ProverUnivariates and ExtendedEdges to include gemini_masking_poly
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    using Transcript = NativeTranscript;
    using VKAndHash = MegaFlavor::VKAndHash;
};

} // namespace bb
