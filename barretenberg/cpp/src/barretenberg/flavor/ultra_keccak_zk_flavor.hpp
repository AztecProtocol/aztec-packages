// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"

namespace bb {

class UltraKeccakZKFlavor : public UltraKeccakFlavor {
  public:
    // This flavor runs with ZK Sumcheck
    static constexpr bool HasZK = true;

    // The number of entities added for ZK (gemini_masking_poly)
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

    // Determine the number of evaluations of Prover and Libra Polynomials that the Prover sends to the Verifier in
    // the rounds of ZK Sumcheck.
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = UltraKeccakFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to UltraKeccakZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Override AllEntities to use ZK version (this automatically updates ProverPolynomials and AllValues)
    template <typename DataType> using AllEntities = UltraFlavor::AllEntities_<DataType, HasZK>;

    // NUM_WITNESS_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_WITNESS_ENTITIES = UltraKeccakFlavor::NUM_WITNESS_ENTITIES + NUM_MASKING_POLYNOMIALS;
    // NUM_ALL_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_ALL_ENTITIES = UltraKeccakFlavor::NUM_ALL_ENTITIES + NUM_MASKING_POLYNOMIALS;
    // NUM_UNSHIFTED_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_UNSHIFTED_ENTITIES =
        UltraKeccakFlavor::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_POLYNOMIALS;

    // Size of the final PCS MSM for ZK = non-ZK size + NUM_LIBRA_COMMITMENTS (3)
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
    }

    // Override OINK_PROOF_LENGTH to include gemini_masking_poly commitment (sent via commit_to_masking_poly)
    static constexpr size_t OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        /* 1. NUM_WITNESS_ENTITIES commitments (includes gemini_masking_poly) */ (NUM_WITNESS_ENTITIES *
                                                                                  num_elements_comm);

    using AllValues = UltraFlavor::AllValues_<HasZK>;
    using ProverPolynomials = UltraFlavor::ProverPolynomials_<HasZK>;
    using PartiallyEvaluatedMultivariates = UltraFlavor::PartiallyEvaluatedMultivariates_<HasZK>;
    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    // Override ProverUnivariates and ExtendedEdges to include gemini_masking_poly
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    // Proof length formula method
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_elements_comm) +
               /* 2. Libra concatenation commitment*/ (num_elements_comm) +
               /* 3. Libra sum */ (num_elements_fr) +
               /* 4. virtual_log_n sumcheck univariates */
               (virtual_log_n * BATCHED_RELATION_PARTIAL_LENGTH * num_elements_fr) +
               /* 5. NUM_ALL_ENTITIES sumcheck evaluations*/ (NUM_ALL_ENTITIES * num_elements_fr) +
               /* 6. Libra claimed evaluation */ (num_elements_fr) +
               /* 7. Libra grand sum commitment */ (num_elements_comm) +
               /* 8. Libra quotient commitment */ (num_elements_comm) +
               /* 9. virtual_log_n - 1 Gemini Fold commitments */
               ((virtual_log_n - 1) * num_elements_comm) +
               /* 10. virtual_log_n Gemini a evaluations */
               (virtual_log_n * num_elements_fr) +
               /* 11. NUM_SMALL_IPA_EVALUATIONS libra evals */ (NUM_SMALL_IPA_EVALUATIONS * num_elements_fr) +
               /* 12. Shplonk Q commitment */ (num_elements_comm) +
               /* 13. KZG W commitment */ (num_elements_comm);
    }

    using Transcript = UltraKeccakFlavor::Transcript;
    using VKAndHash = UltraKeccakFlavor::VKAndHash;
};
} // namespace bb
