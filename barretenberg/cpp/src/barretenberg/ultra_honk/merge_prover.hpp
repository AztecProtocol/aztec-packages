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
                                                      const std::vector<FF>& degree_check_challenges)
    {
        Polynomial reversed_batched_left_tables(left_table[0].size());
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            reversed_batched_left_tables.add_scaled(left_table[idx], degree_check_challenges[idx]);
        }
        return reversed_batched_left_tables.reverse();
    }

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
                                                       const std::vector<FF>& evals)
    {
        // Q s.t. Q * (X - \kappa) * (X - \kappa^{-1}) =
        //   (X - \kappa^{-1}) * (\sum_i \beta_i (L_i - l_i) + \sum_i \beta_i (R_i - r_i) + \sum_i \beta_i (M_i - m_i))
        // + (X - \kappa) * \beta_i (G - g)
        Polynomial shplonk_batched_quotient(merged_table[0].size());

        // Handle polynomials opened at \kappa
        for (size_t idx_table = 0; idx_table < 3; idx_table++) {
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                FF challenge = shplonk_batching_challenges[(idx_table * NUM_WIRES) + idx];
                FF eval = evals[(idx_table * NUM_WIRES) + idx];
                if (idx_table == 0) {
                    // Q += L_i * \beta_i
                    shplonk_batched_quotient.add_scaled(left_table[idx], challenge);
                } else if (idx_table == 1) {
                    // Q += R_i * \beta_i
                    shplonk_batched_quotient.add_scaled(right_table[idx], challenge);
                } else {
                    // Q += M_i * \beta_i
                    shplonk_batched_quotient.add_scaled(merged_table[idx], challenge);
                }
                // Q -= eval * \beta_i
                shplonk_batched_quotient.at(0) -= challenge * eval;
            }
        }
        // Q /= (X - \kappa)
        shplonk_batched_quotient.factor_roots(kappa);

        // Q += (G - g) / (X - \kappa^{-1}) * \beta_i
        Polynomial reversed_batched_left_tables_copy(reversed_batched_left_tables);
        reversed_batched_left_tables_copy.at(0) -= evals.back();
        reversed_batched_left_tables_copy.factor_roots(kappa_inv);
        shplonk_batched_quotient.add_scaled(reversed_batched_left_tables_copy, shplonk_batching_challenges.back());

        return shplonk_batched_quotient;
    };

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
                                                      const std::vector<FF>& evals)
    {
        // Q' (partially evaluated batched quotient) =
        //  -Q * (z - \kappa) +
        //      + (\sum_i \beta_i (L_i - l_i) + \sum_i \beta_i (R_i - r_i) + \sum_i \beta_i (M_i - m_i))
        //      + (z - \kappa) / (z - \kappa^{-1}) * \beta_i (G - g)

        //
        Polynomial shplonk_partially_evaluated_batched_quotient(std::move(shplonk_batched_quotient));
        shplonk_partially_evaluated_batched_quotient *= -(shplonk_opening_challenge - kappa);

        // Handle polynomials opened at \kappa
        for (size_t idx_table = 0; idx_table < 3; idx_table++) {
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                FF challenge = shplonk_batching_challenges[(idx_table * NUM_WIRES) + idx];
                FF eval = evals[(idx_table * NUM_WIRES) + idx];
                if (idx_table == 0) {
                    // Q' += L_i * \beta_i
                    shplonk_partially_evaluated_batched_quotient.add_scaled(left_table[idx], challenge);
                } else if (idx_table == 1) {
                    // Q' += R_i * \beta_i
                    shplonk_partially_evaluated_batched_quotient.add_scaled(right_table[idx], challenge);
                } else {
                    // Q' += M_i * \beta_i
                    shplonk_partially_evaluated_batched_quotient.add_scaled(merged_table[idx], challenge);
                }
                // Q' -= eval * \beta_i
                shplonk_partially_evaluated_batched_quotient.at(0) -= challenge * eval;
            }
        }

        // Q' += (G - g) / (z - \kappa^{-1}) * (z - \kappa) * \beta_i
        reversed_batched_left_tables.at(0) -= evals.back();
        shplonk_partially_evaluated_batched_quotient.add_scaled(reversed_batched_left_tables,
                                                                shplonk_batching_challenges.back() *
                                                                    (shplonk_opening_challenge - kappa) *
                                                                    (shplonk_opening_challenge - kappa_inv).invert());

        OpeningClaim shplonk_opening_claim = { .polynomial = std::move(shplonk_partially_evaluated_batched_quotient),
                                               .opening_pair = { shplonk_opening_challenge, FF(0) } };

        return shplonk_opening_claim;
    }
};

} // namespace bb
