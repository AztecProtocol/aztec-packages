// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/flavor/mega_flavor.hpp"

namespace bb {

/*!
\brief Child class of MegaFlavor that runs with ZK Sumcheck.
 See more in \ref docs/src/sumcheck-outline.md "Sumcheck Outline".
*/
class MegaZKFlavor : public bb::MegaFlavor {
  public:
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = true;
    // The degree has to be increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MegaFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to MegaZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Proof length formula
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_frs_comm) +
        /* 2. Libra concatenation commitment*/ (num_frs_comm) +
        /* 3. Libra sum */ (num_frs_fr) +
        /* 4. CONST_PROOF_SIZE_LOG_N sumcheck univariates */
        (CONST_PROOF_SIZE_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr) +
        /* 5. NUM_ALL_ENTITIES sumcheck evaluations*/ (NUM_ALL_ENTITIES * num_frs_fr) +
        /* 6. Libra claimed evaluation */ (num_frs_fr) +
        /* 7. Libra grand sum commitment */ (num_frs_comm) +
        /* 8. Libra quotient commitment */ (num_frs_comm) +
        /* 9. Gemini masking commitment */ (num_frs_comm) +
        /* 10. Gemini masking evaluation */ (num_frs_fr) +
        /* 11. CONST_PROOF_SIZE_LOG_N - 1 Gemini Fold commitments */
        ((CONST_PROOF_SIZE_LOG_N - 1) * num_frs_comm) +
        /* 12. CONST_PROOF_SIZE_LOG_N Gemini a evaluations */
        (CONST_PROOF_SIZE_LOG_N * num_frs_fr) +
        /* 13. NUM_SMALL_IPA_EVALUATIONS libra evals */ (NUM_SMALL_IPA_EVALUATIONS * num_frs_fr) +
        /* 14. Shplonk Q commitment */ (num_frs_comm) +
        /* 15. KZG W commitment */ (num_frs_comm);

    using Transcript = NativeTranscript;
};

} // namespace bb
