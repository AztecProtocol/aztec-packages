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
     * @details The verifier receives commitments [C_0]..[C_{M-1}] as input (collected from the HN proof
     * verifications during the accumulation loop). Unused slots are the point at infinity. It then reads
     * [T], [G] and all evaluations from the proof, checks the concatenation and degree identities, performs an hash
     * check, and reduces to a KZG pairing check.
     *
     * @param proof                Batch merge proof.
     * @param subtable_commitments [C_0]..[C_{M-1}] — interleaved column commitments for each subtable.
     * @return ReductionResult with pairing points and merged table commitments.
     */
    [[nodiscard("Verification result should be checked")]] ReductionResult reduce_to_pairing_check(const Proof& proof,
                                                                                                   const FF hash);

    /**
     * @brief Compute one step of the ECC op running hash
     * @details Returns Poseidon2([prev_hash, serialize_to_fields(col_commitments)]).
     */
    static FF ecc_op_hash_step(const std::vector<Commitment>& col_commitments,
                               const std::optional<FF>& prev_hash = std::nullopt);

  private:
    /**
     * @brief Compute array of length M := MaxMergeSize s.t. indicator_array[i] = (i >= (M - N)), where N is the number
     * of subtables to merge (sent by the prover).
     *
     * @param N
     * @return std::vector<FF>
     */
    std::vector<FF> compute_indicator_array(const FF& N) const;

    /**
     * @brief Compute array of length M := MaxMergeSize s.t. dirac_array[i] = (i == N - 1)
     *
     * @param indicator_array
     * @return std::vector<FF>
     */
    std::vector<FF> compute_dirac_array(const std::vector<FF>& indicator_array) const;

    /**
     * @brief Verify the concatenation identity T(κ) = Σ_i C_i(κ) · κ^{offset_i} for every column.
     * @details offset_i = Σ_{j<i} shift_sizes[j] · BATCH_SIZE.
     */
    bool check_concatenation_identity(const std::vector<std::vector<FF>>& c_evals,
                                      const std::vector<FF>& t_evals,
                                      const std::vector<FF>& powers_of_kappa) const;

    /**
     * @brief Verify the degree identity
     *      G(κ⁻¹) = Σ_{i,col} α_{i,col} · C_i_col(κ) · κ^{1 − shift_sizes[j] * BATCH_SIZE}
     * @details This is a single combined check across all subtables and columns.
     */
    bool check_degree_identity(const std::vector<std::vector<FF>>& c_evals,
                               const FF& reversed_cols_eval,
                               const std::vector<FF>& powers_of_kappa_inv,
                               const std::vector<FF>& degree_check_challenges,
                               const FF& kappa) const;

    /**
     * @brief Verify that the column commitments in the proof match the running hash from accumulation.
     * @details This ensures that the commitments provided in the proof are consistent with the expected
     * running hash computed during the accumulation process.
     */
    bool check_hash_consistency(const FF& hash,
                                const std::vector<FF>& calculated_hashes,
                                const std::vector<FF>& indicator_array) const;
};

// Type aliases for convenience
template <size_t BatchSize>
using BatchMergeVerifier = BatchMergeVerifier_<BatchSize, curve::BN254, CHONK_MAX_ACCUMULATION_STEPS>;

namespace stdlib::recursion::goblin {
template <size_t BatchSize, typename Builder>
using BatchMergeRecursiveVerifier = BatchMergeVerifier_<BatchSize, bn254<Builder>, CHONK_MAX_ACCUMULATION_STEPS>;
} // namespace stdlib::recursion::goblin

} // namespace bb
