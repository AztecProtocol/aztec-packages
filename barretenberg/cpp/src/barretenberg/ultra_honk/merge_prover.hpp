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
        //  Q * (z - \kappa) +
        //      - (\sum_i \beta_i (L_i - l_i) + \sum_i \beta_i (R_i - r_i) + \sum_i \beta_i (M_i - m_i))
        //      - (z - \kappa) / (z - \kappa^{-1}) * \beta_i (G - g)

        //
        Polynomial shplonk_partially_evaluated_batched_quotient(std::move(shplonk_batched_quotient));
        shplonk_partially_evaluated_batched_quotient *= (shplonk_opening_challenge - kappa);

        // Handle polynomials opened at \kappa
        for (size_t idx_table = 0; idx_table < 3; idx_table++) {
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                FF challenge = shplonk_batching_challenges[(idx_table * NUM_WIRES) + idx];
                FF eval = evals[(idx_table * NUM_WIRES) + idx];
                if (idx_table == 0) {
                    // Q' -= L_i * \beta_i
                    shplonk_partially_evaluated_batched_quotient.add_scaled(left_table[idx], -challenge);
                } else if (idx_table == 1) {
                    // Q' -= R_i * \beta_i
                    shplonk_partially_evaluated_batched_quotient.add_scaled(right_table[idx], -challenge);
                } else {
                    // Q' -= M_i * \beta_i
                    shplonk_partially_evaluated_batched_quotient.add_scaled(merged_table[idx], -challenge);
                }
                // Q' += eval * \beta_i
                shplonk_partially_evaluated_batched_quotient.at(0) += challenge * eval;
            }
        }

        // Q' -= (G - g) / (z - \kappa^{-1}) * (z - \kappa) * \beta_i
        reversed_batched_left_tables.at(0) -= evals.back();
        shplonk_partially_evaluated_batched_quotient.add_scaled(reversed_batched_left_tables,
                                                                -shplonk_batching_challenges.back() *
                                                                    (shplonk_opening_challenge - kappa) *
                                                                    (shplonk_opening_challenge - kappa_inv).invert());

        OpeningClaim shplonk_opening_claim = { .polynomial = shplonk_partially_evaluated_batched_quotient,
                                               .opening_pair = { shplonk_opening_challenge, FF(0) } };

        return shplonk_opening_claim;
    }
};

} // namespace bb
