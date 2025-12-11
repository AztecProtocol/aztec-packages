// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Prover class for the Goblin ECC op queue transcript merge protocol
 *
 */
class MergeProver {
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using PCS = KZG<Curve>;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using OpeningPair = bb::OpeningPair<Curve>;
    using Transcript = NativeTranscript;

  public:
    using MergeProof = std::vector<FF>;

    explicit MergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                         const MergeSettings settings = MergeSettings::PREPEND,
                         const CommitmentKey& commitment_key = CommitmentKey(),
                         const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    BB_PROFILE MergeProof construct_proof();

    std::shared_ptr<ECCOpQueue> op_queue;
    CommitmentKey pcs_commitment_key;
    std::shared_ptr<Transcript> transcript;
    MergeSettings settings;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

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

    /**
     * @brief Compute the batched polynomial for the degree check.
     *
     * @details To show that \f$\deg(L_j) < k\f$, the prover batches the \f$L_i\f$'s as \f$\sum_i \alpha_i L_i\f$ and
     * computes \f$G(X) = (\sum_i \alpha_i L_i(X)) X^{k-1}\f$. The prover commits to \f$G\f$ and later opens \f$L_i\f$
     * at \f$\kappa\f$ and \f$G\f$ at \f$\kappa^{-1}\f$, so to show that \f$G(\kappa^{-1}) = (\sum_i \alpha_i
     * L_i(\kappa)) * \kappa^{-(k-1)}\f$.
     *
     * @param left_table
     * @param degree_check_challenges
     * @return Polynomial
     */
    static Polynomial compute_degree_check_polynomial(const std::array<Polynomial, NUM_WIRES>& left_table,
                                                      const std::vector<FF>& degree_check_challenges);

    /**
     * @brief Compute the batched Shplonk quotient polynomial.
     *
     * @details This function computes the polynomial \f$Q(X)\f$ such that \f$Q(X) * (X - \kappa) * (X - \kappa^{-1}) =
     * F(X)\f$, where \f$F(X)\f$ is defined as
     * \f[
     *  (X - \kappa^{-1}) * (\sum_i \beta_i (L_i - l_i) + \sum_i \beta_i (R_i - r_i) + \sum_i \beta_i (M_i - m_i))
     *       + (X - \kappa) * \beta_i (G - g)
     * \f]
     *
     */
    static Polynomial compute_shplonk_batched_quotient(const std::array<Polynomial, NUM_WIRES>& left_table,
                                                       const std::array<Polynomial, NUM_WIRES>& right_table,
                                                       const std::array<Polynomial, NUM_WIRES>& merged_table,
                                                       const std::vector<FF>& shplonk_batching_challenges,
                                                       const FF& kappa,
                                                       const FF& kappa_inv,
                                                       const Polynomial& reversed_batched_left_tables,
                                                       const std::vector<FF>& evals);

    /**
     * @brief Compute the partially evaluated Shplonk batched quotient and the resulting opening claim.
     *
     * @details Compute the partially evaluated batched quotient \f$Q'(X)\f$ defined as:
     * \f[
     *  -Q * (z - \kappa) +
     *      + (\sum_i \beta_i (L_i - l_i) + \sum_i \beta_i (R_i - r_i) + \sum_i \beta_i (M_i - m_i))
     *      + (z - \kappa) / (z - \kappa^{-1}) * \beta_i (G - g)
     * \f]
     * and return the opening claim \f$\{ Q', (z, 0) \}\f$.
     *
     */
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
