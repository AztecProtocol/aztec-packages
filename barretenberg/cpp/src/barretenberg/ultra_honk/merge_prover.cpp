// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "merge_prover.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"

namespace bb {

/**
 * @brief Create MergeProver
 * @details We require an SRS at least as large as the current ultra ecc ops table
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1267): consider possible efficiency improvements
 */
MergeProver::MergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                         const CommitmentKey& commitment_key,
                         const std::shared_ptr<Transcript>& transcript)
    : op_queue(op_queue)
    , pcs_commitment_key(commitment_key.initialized() ? commitment_key
                                                      : CommitmentKey(op_queue->get_ultra_ops_table_num_rows()))
    , transcript(transcript){};

/**
 * @brief Prove proper construction of the aggregate Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
 * @details Let T_j be the jth column of the aggregate ecc op table after prepending the subtable columns t_j containing
 * the contribution from the present circuit. T_{j,prev} corresponds to the columns of the aggregate table at the
 * previous stage. For each column we have the relationship T_j = t_j + right_shift(T_{j,prev}, k), where k is the
 * length of the subtable columns t_j. This protocol demonstrates that the aggregate ecc op table has been
 * constructed correctly via:
 * - the Schwartz-Zippel check:
 *      \f[ T_j(\kappa) = t_j(\kappa) + \kappa^k * (T_{j,prev}(\kappa)) \f]
 * - the degree check a la Thakur:
 *      \f[ \kappa^{l-1} t_j(1/\kappa) = g_j(\kappa) \f]
 *   where \f$g_j(X) = X^{l-1} t_j(1 / X)\f$.
 *
 * @note The prover doesn't commit to t_j because it shares a transcript with the PG instance that folds the present
 * circuit, and therefore t_j has already been added to the transcript by PG.
 *
 * @return honk::proof
 */
MergeProver::MergeProof MergeProver::construct_proof()
{
    /**
     * The prover wants to convince the verifier that, for j = 1, 2, 3, 4:
     *      - T_j(X) = t_j(X) + X^l T_{prev,j}(X) (1)
     *      - deg(t_j(X)) < l                     (2)
     * where l = subtable_size.
     *
     * Condition (1) is equivalent, up to negligible probability, to:
     *      t_j(kappa) + kappa^l T_{prev,j}(kappa) - T_j(kappa) = 0
     * so the prover constructs the polynomial
     *      p_j(X) := t_j(X) + kappa^{l-1} T_{prev, j}(X) - T_j(X)
     * and proves that it opens to 0 at kappa.
     *
     * To convince the verifier of (2), the prover commits to a polynomial g_j(X) (allegedly equal to X^{l-1} t_j(1/X))
     * and provides openings c, d, of t_j(X) and g_j(X) at 1/kappa and kappa, respectively. The verifier then checks
     * that:
     *      c * kappa^{l-1} = d
     * This check is equivalent, up to negligible probablity, to (2) because if deg(t_j(X)) >= l, then the prover is
     * not able to commit to a polynomial g_j(X) that satisfies:
     *      g_j(kappa) = kappa^{l-1} t_j(1/kappa)
     * for a random evaluation challenge kappa.
     */

    std::array<Polynomial, NUM_WIRES> t = op_queue->construct_current_ultra_ops_subtable_columns();
    std::array<Polynomial, NUM_WIRES> T_prev = op_queue->construct_previous_ultra_ops_table_columns();
    std::array<Polynomial, NUM_WIRES> T = op_queue->construct_ultra_ops_table_columns();
    std::array<Polynomial, NUM_WIRES> t_reversed;
    // Compute g_j(X) = X^{l-1} t_j(1/X)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        t_reversed[idx] = t[idx].reverse();
    }

    const size_t subtable_size = t[0].size();
    const size_t table_size = T[0].size();

    // Send subtable size to the verifier
    transcript->send_to_verifier("subtable_size", static_cast<uint32_t>(subtable_size));

    // Compute commitments [T_prev], [T], [reversed_t], and send to the verifier
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        transcript->send_to_verifier("T_PREV_" + std::to_string(idx), pcs_commitment_key.commit(T_prev[idx]));
        transcript->send_to_verifier("T_" + std::to_string(idx), pcs_commitment_key.commit(T[idx]));
        transcript->send_to_verifier("t_REVERSED_" + std::to_string(idx), pcs_commitment_key.commit(t_reversed[idx]));
    }

    // Compute evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF pow_kappa = kappa.pow(subtable_size);
    const FF kappa_inv = kappa.invert();

    // Opening claims for each polynomial p_j, t_j, g_j
    //
    // The opening claims are sent in the following order:
    // {kappa, 0}, {kappa, 0}, {kappa, 0}, {kappa, 0},
    //      {1/kappa, t_1(1/kappa)}, {kappa, g_1(kappa)},
    //          {1/kappa, t_2(1/kappa)}, {kappa, g_2(kappa)},
    //              {1/kappa, t_3(1/kappa)}, {kappa, g_3(kappa)},
    //                  {1/kappa, t_4(1/kappa)}, {kappa, g_4(kappa)}
    std::vector<OpeningClaim> opening_claims;

    // Set opening claims p_j(\kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Compute p_j(X) = t_j(X) + kappa^l T_{j,prev}(X) - T_j(X)
        Polynomial partially_evaluated_difference(table_size);
        partially_evaluated_difference += t[idx];
        partially_evaluated_difference.add_scaled(T_prev[idx], pow_kappa);
        partially_evaluated_difference -= T[idx];

        opening_claims.emplace_back(OpeningClaim{ partially_evaluated_difference, { kappa, FF(0) } });
    }
    // Compute evaluation t_j(1/kappa), g_j(\kappa), send to verifier, and set opening claims
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation;

        // Evaluate t_j(1/kappa)
        evaluation = t[idx].evaluate(kappa_inv);
        transcript->send_to_verifier("t_eval_kappa_inv_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ t[idx], { kappa_inv, evaluation } });

        // Evaluate g_j(kappa)
        evaluation = t_reversed[idx].evaluate(kappa);
        transcript->send_to_verifier("t_reversed_eval_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ t_reversed[idx], { kappa, evaluation } });
    }

    // Shplonk prover
    OpeningClaim shplonk_opening_claim = ShplonkProver::prove(pcs_commitment_key, opening_claims, transcript);

    // KZG prover
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}
} // namespace bb
