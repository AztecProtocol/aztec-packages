// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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
template <typename Curve> class MergeVerifier_ {
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
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    // Size of batch opening claim: [Q], [L₁..L₄], [R₁..R₄], [M₁..M₄], [G], [1]
    static constexpr size_t MERGE_BATCHED_CLAIM_SIZE = (3 * NUM_WIRES) + 3;

    using TableCommitments = std::array<Commitment, NUM_WIRES>; // Commitments to the subtables and the merged table

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

  private:
    std::vector<std::string> labels_degree_check = { "LEFT_TABLE_DEGREE_CHECK_0",
                                                     "LEFT_TABLE_DEGREE_CHECK_1",
                                                     "LEFT_TABLE_DEGREE_CHECK_2",
                                                     "LEFT_TABLE_DEGREE_CHECK_3" };

    std::vector<std::string> labels_shplonk_batching_challenges = {
        "SHPLONK_MERGE_BATCHING_CHALLENGE_0",  "SHPLONK_MERGE_BATCHING_CHALLENGE_1",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_2",  "SHPLONK_MERGE_BATCHING_CHALLENGE_3",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_4",  "SHPLONK_MERGE_BATCHING_CHALLENGE_5",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_6",  "SHPLONK_MERGE_BATCHING_CHALLENGE_7",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_8",  "SHPLONK_MERGE_BATCHING_CHALLENGE_9",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_10", "SHPLONK_MERGE_BATCHING_CHALLENGE_11",
        "SHPLONK_MERGE_BATCHING_CHALLENGE_12"
    };

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
using MergeVerifier = MergeVerifier_<curve::BN254>;

namespace stdlib::recursion::goblin {
template <typename Builder> using MergeRecursiveVerifier = MergeVerifier_<bn254<Builder>>;
} // namespace stdlib::recursion::goblin

} // namespace bb
