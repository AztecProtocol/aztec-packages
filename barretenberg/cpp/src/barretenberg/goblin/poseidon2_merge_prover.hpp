#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/poseidon2_op_queue.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Prover for the Poseidon2 op queue merge protocol.
 *
 * @details Structurally identical to MergeProver but operates on 5 columns (the Poseidon2
 * op wires) instead of 4 (ECC op wires). Proves correct concatenation of Poseidon2 op queue
 * subtables across IVC iterations.
 *
 * For each of 5 wire columns j, proves:
 *   M_j(X) = L_j(X) + X^k · R_j(X) and deg(L_j) < k
 *
 * where M = merged table, L = left subtable, R = right subtable, k = shift_size.
 *
 * NOTE: In a future refactor, this could be templated with MergeProver to share the
 * identical proof construction logic (only NUM_WIRES and the op queue type differ).
 */
class Poseidon2MergeProver {
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using PCS = KZG<Curve>;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using Transcript = NativeTranscript;

  public:
    using MergeProof = std::vector<FF>;

    explicit Poseidon2MergeProver(const std::shared_ptr<Poseidon2OpQueue>& op_queue,
                                  std::shared_ptr<Transcript> transcript,
                                  MergeSettings settings = MergeSettings::PREPEND);

    BB_PROFILE MergeProof construct_proof();

    CommitmentKey pcs_commitment_key;

  private:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Poseidon2OpQueue> op_queue;
    MergeSettings settings;

    static constexpr size_t NUM_WIRES = Poseidon2OpQueue::TABLE_WIDTH; // = 5

    // Transcript labels (prefixed with P2_ to avoid collisions with ECC merge)
    std::vector<std::string> labels_degree_check = { "P2_LEFT_TABLE_DEGREE_CHECK_0",
                                                     "P2_LEFT_TABLE_DEGREE_CHECK_1",
                                                     "P2_LEFT_TABLE_DEGREE_CHECK_2",
                                                     "P2_LEFT_TABLE_DEGREE_CHECK_3",
                                                     "P2_LEFT_TABLE_DEGREE_CHECK_4" };

    // 3 tables × 5 wires + 1 degree check = 16 batching challenges
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

    static Polynomial compute_degree_check_polynomial(const std::array<Polynomial, NUM_WIRES>& left_table,
                                                      const std::vector<FF>& degree_check_challenges);

    static Polynomial compute_shplonk_batched_quotient(const std::array<Polynomial, NUM_WIRES>& left_table,
                                                       const std::array<Polynomial, NUM_WIRES>& right_table,
                                                       const std::array<Polynomial, NUM_WIRES>& merged_table,
                                                       const std::vector<FF>& shplonk_batching_challenges,
                                                       const FF& kappa,
                                                       const FF& kappa_inv,
                                                       const Polynomial& reversed_batched_left_tables,
                                                       const std::vector<FF>& evals);

    static OpeningClaim compute_shplonk_opening_claim(Polynomial& shplonk_batched_quotient,
                                                      const FF& shplonk_opening_challenge,
                                                      const std::array<Polynomial, NUM_WIRES>& left_table,
                                                      const std::array<Polynomial, NUM_WIRES>& right_table,
                                                      const std::array<Polynomial, NUM_WIRES>& merged_table,
                                                      const std::vector<FF>& shplonk_batching_challenges,
                                                      const FF& kappa,
                                                      const FF& kappa_inv,
                                                      Polynomial& reversed_batched_left_tables,
                                                      const std::vector<FF>& evals);
};

} // namespace bb
