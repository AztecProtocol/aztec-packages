#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/poseidon2_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Verifier for the Poseidon2 op queue merge protocol.
 *
 * @details Structurally identical to MergeVerifier_ but operates on 5 columns
 * (Poseidon2 op wires) instead of 4 (ECC op wires). Verifies correct concatenation
 * of Poseidon2 op queue subtables across IVC iterations.
 *
 * Template parameter Curve enables both native (curve::BN254) and recursive
 * (stdlib::bn254<Builder>) verification.
 *
 * NOTE: In a future refactor, this could be templated with MergeVerifier_ to
 * share the identical verification logic (only NUM_WIRES and labels differ).
 */
template <typename Curve> class Poseidon2MergeVerifier_ {
  public:
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using PCS = bb::KZG<Curve>;
    using PairingPoints =
        std::conditional_t<Curve::is_stdlib_type, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;
    using Proof = std::vector<FF>;
    using Transcript = TranscriptFor_t<Curve>;

    static constexpr size_t NUM_WIRES = Poseidon2OpQueue::TABLE_WIDTH; // = 5
    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    // [Q], [L₁..L₅], [R₁..R₅], [M₁..M₅], [G], [1]
    static constexpr size_t MERGE_BATCHED_CLAIM_SIZE = (3 * NUM_WIRES) + 3;

    using TableCommitments = std::array<Commitment, NUM_WIRES>;

    struct InputCommitments {
        TableCommitments t_commitments;
        TableCommitments T_prev_commitments;
    };

    struct ReductionResult {
        PairingPoints pairing_points;
        TableCommitments merged_commitments;
        bool reduction_succeeded = false;
    };

    MergeSettings settings;
    std::shared_ptr<Transcript> transcript;

    explicit Poseidon2MergeVerifier_(const MergeSettings settings = MergeSettings::PREPEND,
                                    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>())
        : settings(settings)
        , transcript(std::move(transcript))
    {}

    [[nodiscard("Verification result should be checked")]] ReductionResult reduce_to_pairing_check(
        const Proof& proof, const InputCommitments& input_commitments);

  private:
    std::vector<std::string> labels_degree_check = { "P2_LEFT_TABLE_DEGREE_CHECK_0",
                                                     "P2_LEFT_TABLE_DEGREE_CHECK_1",
                                                     "P2_LEFT_TABLE_DEGREE_CHECK_2",
                                                     "P2_LEFT_TABLE_DEGREE_CHECK_3",
                                                     "P2_LEFT_TABLE_DEGREE_CHECK_4" };

    std::vector<std::string> labels_shplonk_batching_challenges = {
        "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_0",  "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_1",
        "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_2",  "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_3",
        "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_4",  "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_5",
        "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_6",  "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_7",
        "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_8",  "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_9",
        "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_10", "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_11",
        "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_12", "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_13",
        "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_14", "P2_SHPLONK_MERGE_BATCHING_CHALLENGE_15",
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

using Poseidon2MergeVerifier = Poseidon2MergeVerifier_<curve::BN254>;

namespace stdlib::recursion::goblin {
template <typename Builder> using Poseidon2MergeRecursiveVerifier = Poseidon2MergeVerifier_<bn254<Builder>>;
} // namespace stdlib::recursion::goblin

} // namespace bb
