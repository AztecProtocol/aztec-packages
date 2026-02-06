// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"

namespace bb {

/**
 * @brief ZK version of MultiMegaFlavor with coefficient interleaving.
 * @details Combines:
 *   - Coefficient interleaving (batch=4) from MultiMegaFlavor
 *   - ZK sumcheck with masking from MegaZKFlavor
 *
 * Used for the hiding kernel in Chonk IVC.
 *
 * Key properties:
 *   - 9 interleaved witness commitments (vs 24 individual in MegaFlavor)
 *   - 8 interleaved precomputed commitments (vs 31 individual)
 *   - ZK masking polynomial (gemini_masking_poly)
 *   - 3 Libra commitments for ZK sumcheck
 *   - +2 Gemini rounds (log(n)+2 total) due to interleaving
 *
 * See multichonk.md for interleaving design and benchmarks.
 */
class MultiMegaZKFlavor : public bb::MultiMegaFlavor {
  public:
    // MultiMegaZK is used for the Hiding Kernel in Chonk
    static constexpr size_t VIRTUAL_LOG_N = HIDING_KERNEL_LOG_N;

    // Indicates that this flavor runs with ZK Sumcheck
    static constexpr bool HasZK = true;

    // The number of entities added for ZK (gemini_masking_poly)
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

    // The degree has to be increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MultiMegaFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to MultiMegaZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Override AllEntities to use ZK version (includes gemini_masking_poly via MaskingEntities)
    // Note: MultiMegaFlavor inherits from MegaFlavor, which has AllEntities_ templated on HasZK
    template <typename DataType> using AllEntities = MultiMegaFlavor::AllEntities_<DataType, HasZK>;

    // NUM_WITNESS_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_WITNESS_ENTITIES = MultiMegaFlavor::NUM_WITNESS_ENTITIES + NUM_MASKING_POLYNOMIALS;
    // NUM_ALL_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_ALL_ENTITIES = MultiMegaFlavor::NUM_ALL_ENTITIES + NUM_MASKING_POLYNOMIALS;
    // NUM_UNSHIFTED_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MultiMegaFlavor::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_POLYNOMIALS;

    // Size of the final PCS MSM for ZK with interleaving:
    // - MultiMegaFlavor has 17 interleaved commitments (8 precomputed + 9 witness)
    // - +1 for gemini_masking_poly commitment
    // - +3 for NUM_LIBRA_COMMITMENTS
    // - +(pcs_log_n - 1) Gemini folds where pcs_log_n = log_n + INTERLEAVING_LOG_K
    // - +1 for Shplonk Q commitment
    // - +1 for G1 identity
    // - +1 for KZG W commitment
    //
    // Total: (8 precomputed + 9 witness) + 1 masking + 3 shifted + 3 Libra + (pcs_log_n - 1) + 3
    //      = 17 + 1 + 3 + 3 + pcs_log_n - 1 + 3 = 26 + pcs_log_n
    //
    // For log_n=21, pcs_log_n=23 → 26 + 23 = 49
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
        // Breakdown:
        // - NUM_ALL_INTERLEAVED_COMMITMENTS = 17 (8 precomputed + 9 witness)
        // - NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = 3 (W₁, W₆, W₉)
        // - NUM_MASKING_POLYNOMIALS = 1 (gemini_masking_poly)
        // - NUM_LIBRA_COMMITMENTS = 3 (Libra for ZK sumcheck)
        // - Gemini folds = pcs_log_n - 1
        // - Shplonk Q = 1
        // - G1 identity = 1
        // - KZG W = 1
        return NUM_ALL_INTERLEAVED_COMMITMENTS + NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS + NUM_MASKING_POLYNOMIALS +
               NUM_LIBRA_COMMITMENTS + (pcs_log_n - 1) + 3;
    }

    using AllValues = MultiMegaFlavor::AllValues_<HasZK>;
    using ProverPolynomials = MultiMegaFlavor::ProverPolynomials_<HasZK>;
    using PartiallyEvaluatedMultivariates = MultiMegaFlavor::PartiallyEvaluatedMultivariates_<HasZK>;
    using VerifierCommitments = MultiMegaFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    // Override ProverUnivariates and ExtendedEdges to include gemini_masking_poly
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    using Transcript = NativeTranscript;
    using VKAndHash = MultiMegaFlavor::VKAndHash;
};

} // namespace bb
