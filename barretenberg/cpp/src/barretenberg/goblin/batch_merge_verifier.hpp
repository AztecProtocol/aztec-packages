// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Unified batch verifier for the batch Goblin ECC op queue merge protocol.
 * @details Works for both native verification and recursive (in-circuit) verification.
 *
 * @tparam Curve     The curve type (native curve::BN254 or stdlib bn254<Builder>)
 * @tparam MaxMergeSize The maximum number of subtables that can be merged
 */
template <typename Curve, size_t MaxMergeSize> class BatchMergeVerifier_ {
  public:
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using PCS = bb::KZG<Curve>;
    using PairingPoints =
        std::conditional_t<Curve::is_stdlib_type, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;
    using Proof = std::vector<FF>;
    using Transcript = TranscriptFor_t<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;

    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static constexpr size_t MAX_MERGE_SIZE = MaxMergeSize;
    static constexpr size_t LOG_MAX_MERGE_SIZE = static_cast<size_t>(numeric::get_msb(MAX_MERGE_SIZE));
    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    static constexpr size_t NUM_COLUMN_TABLES = MAX_MERGE_SIZE + 1; // ZK table + subtables
    static constexpr size_t NUM_EVALS_FROM_COLUMNS = NUM_COLUMN_TABLES * NUM_WIRES;
    static constexpr size_t NUM_EVALS =
        ((MAX_MERGE_SIZE + 2) * NUM_WIRES) + 1; // ZK table, subtables, merged tables, degree check poly
    static constexpr size_t NUM_OPENING_CLAIMS = NUM_EVALS;
    static constexpr size_t MERGE_BATCHED_CLAIM_SIZE = NUM_OPENING_CLAIMS + 2; // Add Shplonk quotient + identity

    using TableCommitments = std::array<Commitment, NUM_WIRES>;

    /**
     * @brief Result of batch merge verification.
     */
    struct ReductionResult {
        PairingPoints pairing_points;
        TableCommitments merged_commitments; // [T_0]..[T_{NUM_WIRES-1}]
        bool reduction_succeeded = false;
    };

    // Public for testing purposes
    std::shared_ptr<Transcript> transcript;

    explicit BatchMergeVerifier_()
        : transcript(std::make_shared<Transcript>())
    {}

    /**
     * @brief Reduce the batch merge proof to a pairing check.
     *
     *
     * @param proof                Batch merge proof.
     * @param hash                 Running hash of the column commitments [C_0]..[C_{M-1}]
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
     * @brief Compute array of length M := MaxMergeSize s.t. indicator_array[i] = (i < N).
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
     * @details offset_i = Σ_{j<i} shift_sizes[j]
     *
     * @param evals Evaluations of C_i(κ) and T(κ) received from the proof
     * @param pow_kappa_subtable_size Precomputed κ^{shift_sizes[i]} for each subtable i
     */
    bool check_concatenation_identity(std::vector<FF>& evals, const std::vector<FF>& pow_kappa_subtable_size) const;

    /**
     * @brief Verify the degree identity
     *      G(κ⁻¹) = Σ_{i,col} α_{i,col} · C_i_col(κ) · κ^{1 − shift_sizes[j]}
     * @details This is a single combined check across all subtables and columns.
     */
    bool check_degree_identity(std::vector<FF>& evals,
                               const std::vector<FF>& powers_of_kappa_inv,
                               const FF& kappa,
                               const std::vector<FF>& degree_check_challenges) const;

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
using BatchMergeVerifier = BatchMergeVerifier_<curve::BN254, CHONK_MAX_NUM_CIRCUITS>;

namespace stdlib::recursion::goblin {
template <typename Builder>
using BatchMergeRecursiveVerifier = BatchMergeVerifier_<bn254<Builder>, CHONK_MAX_NUM_CIRCUITS>;
} // namespace stdlib::recursion::goblin

} // namespace bb
