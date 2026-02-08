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
 *   - ZK sumcheck with masking from MegaZKFlavor pattern
 *
 * Used for the hiding kernel in Chonk IVC.
 *
 * Key differences from MultiMegaFlavor:
 *   - 4 masking chunk polynomials in AllEntities (masking_chunk_0..3)
 *   - 10 interleaved witness commitments (9 base + W₁₀ masking)
 *   - 3 Libra commitments for ZK sumcheck
 *   - ZK sumcheck with Row Disabling Polynomial (BATCHED_RELATION_PARTIAL_LENGTH + 1)
 *
 * The masking polynomial is split into 4 chunks of size n (one per interleaving slot).
 * These chunks are committed as an interleaved group (W₁₀) and their evaluations flow
 * through sumcheck naturally, eliminating manual masking handling in PCS.
 *
 * See multichonk.md for interleaving design and benchmarks.
 */
class MultiMegaZKFlavor : public MultiMegaFlavor {
  public:
    // MultiMegaZK is used for the Hiding Kernel in Chonk
    static constexpr size_t VIRTUAL_LOG_N = HIDING_KERNEL_LOG_N;

    // Indicates that this flavor runs with ZK Sumcheck
    static constexpr bool HasZK = true;

    // The degree has to be increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MultiMegaFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to MultiMegaZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Entity counts: +4 for masking chunks
    static constexpr size_t NUM_MASKING_ENTITIES = 4;
    static constexpr size_t NUM_WITNESS_ENTITIES = MultiMegaFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = MultiMegaFlavor::NUM_ALL_ENTITIES + NUM_MASKING_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MultiMegaFlavor::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_ENTITIES;

    // 10 interleaved witness commitments (9 base + 1 masking group)
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = 10;

    // Total interleaved commitments: 8 precomputed + 10 witness = 18
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;

    // Override AllEntities to use ZK version (includes 4 masking chunks via MultiMegaMaskingEntities)
    template <typename DataType> using AllEntities = MultiMegaFlavor::AllEntities_<DataType, HasZK>;

    using AllValues = MultiMegaFlavor::AllValues_<HasZK>;
    using ProverPolynomials = MultiMegaFlavor::ProverPolynomials_<HasZK>;
    using PartiallyEvaluatedMultivariates = MultiMegaFlavor::PartiallyEvaluatedMultivariates_<HasZK>;
    using VerifierCommitments = MultiMegaFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    // Override ProverUnivariates and ExtendedEdges to include masking chunk entities
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    // Use ZK interleaved witness commitments (10 members including masking)
    template <typename DataType>
    using InterleavedWitnessCommitments = MultiMegaFlavor::InterleavedWitnessCommitments_<DataType, HasZK>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;
    using InterleavedCommitmentLabels = MultiMegaFlavor::InterleavedCommitmentLabels_<HasZK>;

    using Transcript = NativeTranscript;
    using VKAndHash = MultiMegaFlavor::VKAndHash;

    // Override REPEATED_COMMITMENTS: ZK has 10 witness commitments (7 unshiftable + 3 shiftable),
    // so indices differ from the non-ZK base.
    static constexpr size_t SHPLEMINI_OFFSET = 1; // Only Shplonk:Q (no Gemini masking poly in MultiMega)
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        RepeatedCommitmentsData(SHPLEMINI_OFFSET + NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS +
                                    (NUM_INTERLEAVED_WITNESS_COMMITMENTS - NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS),
                                SHPLEMINI_OFFSET + NUM_ALL_INTERLEAVED_COMMITMENTS,
                                NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS);

    // FINAL_PCS_MSM_SIZE: with REPEATED_COMMITMENTS optimization, shifted commitments are merged
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
        // 18 unshifted (shifted merged) + 3 Libra + (pcs_log_n - 1) Gemini folds + 1 Shplonk Q + 1 G1 identity +
        // 1 KZG W
        return NUM_ALL_INTERLEAVED_COMMITMENTS + NUM_LIBRA_COMMITMENTS + (pcs_log_n - 1) + 3;
    }

    /**
     * @brief Override get_unshifted_groups to include masking group before the shiftable groups.
     * @details Inserts W₁₀ (masking) before the last NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS groups,
     *          maintaining the invariant: unshiftable groups first, shiftable groups at the end.
     */
    template <typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        auto groups = MultiMegaFlavor::get_unshifted_groups(e);
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        // Insert masking before the shiftable groups (last 3 groups)
        auto insert_pos = groups.end() - NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;
        groups.insert(insert_pos,
                      Group{ &e.masking_chunk_0, &e.masking_chunk_1, &e.masking_chunk_2, &e.masking_chunk_3 });
        return groups;
    }

    // get_to_be_shifted_groups and get_shifted_groups are inherited unchanged (masking chunks are not shifted)
};

} // namespace bb
