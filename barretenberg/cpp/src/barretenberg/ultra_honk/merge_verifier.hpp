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
     * @details Contains pairing points for KZG verification, merged table commitments, and degree check status
     */
    struct VerificationResult {
        PairingPoints pairing_points;
        TableCommitments merged_commitments;
        bool degree_check_passed;
        bool concatenation_check_passed;
    };

    MergeSettings settings;
    std::shared_ptr<Transcript> transcript;

    explicit MergeVerifier_(const MergeSettings settings = MergeSettings::PREPEND,
                            std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>())
        : settings(settings)
        , transcript(std::move(transcript))
    {}

    /**
     * @brief Verify the merge proof
     * @tparam Transcript The transcript type (NativeTranscript or StdlibTranscript<Builder>)
     * @param proof The proof to verify (HonkProof for native, stdlib::Proof<Builder> for recursive)
     * @param input_commitments The input commitments for the merge
     * @param transcript Shared transcript for Fiat-Shamir
     * @return VerificationResult containing pairing points, merged commitments, and degree check status
     */
    [[nodiscard("Verification result should be checked")]] VerificationResult verify_proof(
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

    bool check_concatenation_identities(std::vector<FF>& evals, const FF& pow_kappa) const
    {
        bool concatenation_verified = true;
        FF concatenation_diff(0);
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            concatenation_diff = evals[idx] + (pow_kappa * evals[idx + NUM_WIRES]) - evals[idx + (2 * NUM_WIRES)];
            if constexpr (IsRecursive) {
                concatenation_verified &= concatenation_diff.get_value() == 0;
                concatenation_diff.assert_equal(FF(0),
                                                "assert_equal: merge concatenation identity failed in Merge Verifier");
            } else {
                concatenation_verified &= concatenation_diff == 0;
            }
        }
        return concatenation_verified;
    };

    bool check_degree_identity(std::vector<FF>& evals,
                               const FF& pow_kappa_minus_one,
                               const std::vector<FF>& degree_check_challenges) const
    {
        bool degree_check_verified = true;
        FF degree_check_diff(0);
        for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
            degree_check_diff += evals[idx] * degree_check_challenges[idx];
        }
        degree_check_diff -= evals.back() * pow_kappa_minus_one;
        if constexpr (IsRecursive) {
            degree_check_diff.assert_equal(FF(0), "assert_equal: merge degree identity failed in Merge Verifier");
            degree_check_verified &= degree_check_diff.get_value() == 0;
        } else {
            degree_check_verified &= degree_check_diff == 0;
        }

        return degree_check_verified;
    };

    BatchOpeningClaim<Curve> compute_shplonk_opening_claim(const std::vector<Commitment>& table_commitments,
                                                           const Commitment& shplonk_batched_quotient,
                                                           const FF& shplonk_opening_challenge,
                                                           const std::vector<FF>& shplonk_batching_challenges,
                                                           const FF& kappa,
                                                           const FF& kappa_inv,
                                                           const std::vector<FF>& evals) const
    {
        // Claim {Q', (z, 0)} expressed as
        // Q' = -Q * (z - \kappa) +
        //      + \sum_i \beta_i L_i - \sum_i \beta_i R_i - \sum_i \beta_i M_i
        //      + (z - \kappa) / (z - \kappa^{-1}) * \beta_i G
        //      - \sum_i \beta_i l_i - \sum_i \beta_i r_i - \sum_i \beta_i m_i
        //      - (z - \kappa) / (z - \kappa^{-1}) * \beta_i * g
        BatchOpeningClaim<Curve> batch_opening_claim;

        // Commitment: [L_1], [L_2], ..., [L_n], [R_1], ..., [R_n], [M_1], ..., [M_n], [G], [1]
        batch_opening_claim.commitments = { std::move(shplonk_batched_quotient) };
        for (auto& commitment : table_commitments) {
            batch_opening_claim.commitments.emplace_back(std::move(commitment));
        }
        if constexpr (IsRecursive) {
            batch_opening_claim.commitments.emplace_back(Commitment::one(kappa.get_context()));
        } else {
            batch_opening_claim.commitments.emplace_back(Commitment::one());
        }

        // Scalars:
        // -(shplonk_opening_challenge - kappa), \beta_1, ..., \beta_12,
        // \beta_13 * (z - \kappa) / (z - \kappa^{-1})
        // - ( \sum_i \beta_i l_i + \sum_i \beta_i r_i + \sum_i \beta_i m_i
        //          + \beta_13 * (z - \kappa) / (z - \kappa^{-1})* g )
        batch_opening_claim.scalars = { -(shplonk_opening_challenge - kappa) };
        for (auto& scalar : shplonk_batching_challenges) {
            batch_opening_claim.scalars.emplace_back(std::move(scalar));
        }
        batch_opening_claim.scalars.back() *=
            (shplonk_opening_challenge - kappa) * (shplonk_opening_challenge - kappa_inv).invert();

        batch_opening_claim.scalars.emplace_back(FF(0));
        for (size_t idx = 0; idx < evals.size(); idx++) {
            if (idx < evals.size() - 1) {
                batch_opening_claim.scalars.back() -= evals[idx] * shplonk_batching_challenges[idx];
            } else {
                batch_opening_claim.scalars.back() -= shplonk_batching_challenges.back() * evals.back() *
                                                      (shplonk_opening_challenge - kappa) *
                                                      (shplonk_opening_challenge - kappa_inv).invert();
            }
        }

        batch_opening_claim.evaluation_point = { shplonk_opening_challenge };

        return batch_opening_claim;
    };
};

// Type aliases for convenience
using MergeVerifier = MergeVerifier_<curve::BN254>;

namespace stdlib::recursion::goblin {
template <typename Builder> using MergeRecursiveVerifier = MergeVerifier_<bn254<Builder>>;
} // namespace stdlib::recursion::goblin

} // namespace bb
