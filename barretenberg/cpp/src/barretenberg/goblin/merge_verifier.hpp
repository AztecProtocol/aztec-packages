// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: d1307bdee7f2ee0e737c19b77a26204a8dbafafc}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Unified verifier class for the Goblin ECC op queue transcript merge protocol
 * @details Works for both native verification and recursive (in-circuit) verification
 * @tparam Curve The curve type (native curve::BN254 or stdlib bn254<Builder>)
 */
template <size_t BatchSize, typename Curve> class MergeVerifier_ {
  public:
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using PCS = bb::KZG<Curve>;
    using PairingPoints =
        std::conditional_t<Curve::is_stdlib_type, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;
    using Proof = std::vector<FF>; // Native: std::vector<bb::fr>, Recursive: stdlib::Proof<Builder>
    using Transcript = TranscriptFor_t<Curve>;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t BATCH_SIZE = BatchSize;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static_assert(NUM_WIRES % BATCH_SIZE == 0);
    static constexpr size_t NUM_COLUMNS = NUM_WIRES / BATCH_SIZE;

    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    // Size of batch opening claim: [Q], [L₁..L₄], [R₁..R₄], [M₁..M₄], [G], [1]
    static constexpr size_t MERGE_BATCHED_CLAIM_SIZE = (3 * NUM_COLUMNS) + 3;

    using TableCommitments = std::array<Commitment, NUM_COLUMNS>; // Commitments to the subtables and the merged table

    /**
     * Commitments used by the verifier to run the verification algorithm. They contain:
     *  - `t_commitments`: the subtable commitments data, containing the commitments to t_j read from the transcript by
     *     the HN verifier with which the Merge verifier shares a transcript
     *  - `T_prev_commitments`: the commitments to the full op_queue table after the previous iteration of merge
     */
    struct InputCommitments {
        TableCommitments t_commitments;
        TableCommitments T_prev_commitments;
    };

    /**
     * @brief Result of merge verification
     * @details Contains pairing points for KZG verification, merged table commitments, and aggregate check status.
     * Individual check results are logged internally by the verifier.
     */
    struct ReductionResult {
        PairingPoints pairing_points;
        TableCommitments merged_commitments;
        std::array<Commitment, NUM_WIRES> de_interleaved_merged_commitments;
        bool reduction_succeeded = false; // Aggregate of degree and concatenation checks
    };

    MergeSettings settings;
    std::shared_ptr<Transcript> transcript;

    explicit MergeVerifier_(const MergeSettings settings = MergeSettings::PREPEND,
                            std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>())
        : settings(settings)
        , transcript(std::move(transcript))
    {}

    /**
     * @brief Reduce the merge proof to a pairing check
     * @details Verifies the merge protocol's degree and concatenation checks, then reduces the polynomial opening
     * claims to a KZG pairing check. This method does NOT perform the final pairing verification - it returns
     * pairing points that must be verified externally
     *
     * The merge protocol proves that for each wire column j:
     *   M_j(X) = L_j(X) + X^k * R_j(X)  (concatenation identity)
     *   deg(L_j) < k                     (degree bound)
     *
     * @param proof The merge proof (HonkProof for native, stdlib::Proof<Builder> for recursive)
     * @param input_commitments The input commitments
     * @return ReductionResult containing:
     *   - pairing_points: KZG pairing check points to be verified externally
     *   - merged_commitments: Commitments [M_1]...[M_4] to the merged op queue tables
     *   - reduction_succeeded: true if degree and concatenation checks passed
     */
    [[nodiscard("Verification result should be checked")]] ReductionResult reduce_to_pairing_check(
        const Proof& proof, const InputCommitments& input_commitments);

    [[nodiscard("Verification result should be checked")]] ReductionResult reduce_de_interleaving_to_pairing_check(
        const Proof& proof, const TableCommitments& interleaved_merged_commitments);

  private:
    std::vector<std::string> labels_degree_check()
    {
        std::vector<std::string> labels;
        labels.reserve(NUM_COLUMNS);

        for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
            labels.emplace_back("LEFT_TABLE_DEGREE_CHECK_" + std::to_string(idx));
        }
        return labels;
    }

    std::vector<std::string> labels_shplonk_batching_challenges()
    {
        std::vector<std::string> labels;
        labels.reserve(3 * NUM_COLUMNS + 1);

        for (size_t idx = 0; idx < 3 * NUM_COLUMNS + 1; ++idx) {
            labels.emplace_back("SHPLONK_MERGE_BATCHING_CHALLENGE_" + std::to_string(idx));
        }
        return labels;
    }

    bool check_concatenation_identities(std::vector<FF>& evals, const FF& pow_kappa) const;

    bool check_degree_identity(std::vector<FF>& evals,
                               const FF& pow_kappa_minus_one,
                               const std::vector<FF>& degree_check_challenges) const;

    BatchOpeningClaim<Curve> compute_shplonk_opening_claim(const std::vector<Commitment>& table_commitments,
                                                           const Commitment& shplonk_batched_quotient,
                                                           const FF& shplonk_opening_challenge,
                                                           const std::vector<FF>& shplonk_batching_challenges,
                                                           const FF& kappa,
                                                           const FF& kappa_inv,
                                                           const std::vector<FF>& evals) const;
};

// Type aliases for convenience
template <size_t BatchSize> using MergeVerifier = MergeVerifier_<BatchSize, curve::BN254>;

namespace stdlib::recursion::goblin {
template <size_t BatchSize, typename Builder> using MergeRecursiveVerifier = MergeVerifier_<BatchSize, bn254<Builder>>;
} // namespace stdlib::recursion::goblin

} // namespace bb
