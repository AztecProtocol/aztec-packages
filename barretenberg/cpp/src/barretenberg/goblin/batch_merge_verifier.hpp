// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Unified verifier for the batch Goblin ECC op queue merge protocol.
 * @details Works for both native verification and recursive (in-circuit) verification.
 *
 * The batch merge verifier receives:
 *   - subtable_commitments[0..M-1]: commitments [C_0]..[C_{M-1}] to the individual subtables
 *     (collected from the HN proof verifications during the accumulation loop; empty/infinity for unused slots)
 *   - proof: the batch merge proof from BatchMergeProver
 *
 * It checks:
 *   - Concatenation: T(κ) = sum_i C_i(κ) * κ^{offset_i}
 *   - Degree:        G(κ^{-1}) * κ^{k_max-1} = sum_i α_i * C_i(κ) * κ^{k_max - k_i}
 *   - KZG:           Shplonk batch opening proof
 *
 * @tparam BatchSize Number of individual wire polynomials interleaved into each column commitment
 * @tparam Curve     The curve type (native curve::BN254 or stdlib bn254<Builder>)
 */
template <size_t BatchSize, typename Curve, size_t MaxMergeSize> class BatchMergeVerifier_ {
  public:
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using PCS = bb::KZG<Curve>;
    using PairingPoints =
        std::conditional_t<Curve::is_stdlib_type, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;
    using Proof = std::vector<FF>;
    using Transcript = TranscriptFor_t<Curve>;

    static constexpr size_t BATCH_SIZE = BatchSize;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static_assert(NUM_WIRES % BATCH_SIZE == 0);
    static constexpr size_t NUM_COLUMNS = NUM_WIRES / BATCH_SIZE;

    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    using TableCommitments = std::array<Commitment, NUM_COLUMNS>;

    /**
     * @brief Result of batch merge verification.
     */
    struct ReductionResult {
        PairingPoints pairing_points;
        TableCommitments merged_commitments; // [T_0]..[T_{NUM_COLUMNS-1}]
        bool reduction_succeeded = false;
    };

    std::shared_ptr<Transcript> transcript;

    explicit BatchMergeVerifier_(std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>())
        : transcript(std::move(transcript))
    {}

    /**
     * @brief Reduce the batch merge proof to a pairing check.
     *
     * @param proof                  The batch merge proof from BatchMergeProver.
     * @return ReductionResult with KZG pairing points and [T] commitments.
     */
    [[nodiscard("Verification result should be checked")]] ReductionResult reduce_to_pairing_check(const Proof& proof,
                                                                                                   const FF hash);

  private:
    // Verify T(κ) = Σ_i C_i(κ) · κ^{offset_i} for every column.
    bool check_concatenation_identity(const std::vector<std::vector<FF>>& c_evals,
                                      const std::vector<FF>& t_evals,
                                      const std::vector<FF>& shift_sizes,
                                      const FF& kappa) const;

    // Verify G(κ⁻¹) = Σ_{i,col} α_{i,col} · C_i_col(κ) · κ^{1 − s_i·BS} (single combined check).
    bool check_degree_identity(const std::vector<std::vector<FF>>& c_evals,
                               const FF& reversed_cols_eval,
                               const std::vector<FF>& shift_sizes,
                               const std::vector<FF>& degree_check_challenges,
                               const FF& kappa,
                               const FF& kappa_inv) const;

    // Verify that the column commitments in the proof match the running hash from accumulation.
    bool check_hash_consistency(const std::vector<std::vector<Commitment>>& subtable_cols,
                                const FF& hash,
                                const std::vector<FF>& indicator_array,
                                const Commitment& point_at_infinity) const
        requires IsRecursive;

    bool check_hash_consistency(const std::vector<std::vector<Commitment>>& subtable_cols,
                                const FF& hash,
                                const std::vector<FF>& indicator_array,
                                const Commitment& point_at_infinity) const
        requires(!IsRecursive);
};

// Type aliases for convenience
template <size_t BatchSize>
using BatchMergeVerifier = BatchMergeVerifier_<BatchSize, curve::BN254, CHONK_MAX_ACCUMULATION_STEPS>;

namespace stdlib::recursion::goblin {
template <size_t BatchSize, typename Builder>
using BatchMergeRecursiveVerifier = BatchMergeVerifier_<BatchSize, bn254<Builder>, CHONK_MAX_ACCUMULATION_STEPS>;
} // namespace stdlib::recursion::goblin

} // namespace bb
