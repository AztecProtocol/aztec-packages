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
 * @details Let \f$l_j\f$, \f$r_j\f$, \f$m_j\f$ be three vectors. The Merge prover wants to convince the verifier that
 * \f$\deg(l_j) < k\f$, and that \f$m_j = l_j + right_shift(r_j, k)\f$. The protocol demonstrates the validity of these
 * claims by:
 * - the Schwartz-Zippel check:
 *      \f[ m_j(\kappa) = l_j(\kappa) + \kappa^k * r_j(\kappa) \f]
 * - the degree check a la Thakur:
 *      \f[ \kappa^{l-1} l_j(1/\kappa) = g_j(\kappa) \f]
 *   where \f$g_j(X) = X^{l-1} l_j(1 / X)\f$.
 *
 * In the Goblin scenario, we have:
 * - \f$l_j = t_j, r_j = T_{prev,j}, m_j = T_j\f$ if we are prepending the subtable
 * - \f$l_j = T_{prev,j}, r_j = t_j, m_j = T_j\f$ if we are appending the subtable
 *
 * @note The prover doesn't commit to t_j because it shares a transcript with the PG instance that folds the present
 * circuit, and therefore t_j has already been added to the transcript by PG.
 *
 * @return MergeProver::MergeProof
 */
MergeProver::MergeProof MergeProver::construct_proof()
{
    /**
     * The prover wants to convince the verifier that, for j = 1, 2, 3, 4:
     *      - m_j(X) = l_j(X) + X^l r_j(X)      (1)
     *      - deg(l_j(X)) < k                   (2)
     * where l = shift_size.
     *
     * Condition (1) is equivalent, up to negligible probability, to:
     *      l_j(kappa) + kappa^k r_j(kappa) - m_j(kappa) = 0
     * so the prover constructs the polynomial
     *      p_j(X) := l_j(X) + kappa^{k-1} r_j(X) - m_j(X)
     * and proves that it opens to 0 at kappa.
     *
     * To convince the verifier of (2), the prover commits to g_j(X) (allegedly equal to X^{k-1} l_j(1/X)) and provides
     * openings:
     *      c = l_j(1/kappa)     d = g_j(kappa)
     * The verifier then checks that: c * kappa^{k-1} = d. This check is equivalent, up to negligible probability, to
     * \f$g_j(X) = X^{k-1} l_j(1/X)\f$, which implies \f$deg(l_j) < k$.
     */

    std::array<Polynomial, NUM_WIRES> left_table;
    std::array<Polynomial, NUM_WIRES> right_table;
    std::array<Polynomial, NUM_WIRES> merged_table = op_queue->construct_ultra_ops_table_columns(); // T
    std::array<Polynomial, NUM_WIRES> left_table_reversed;

    if (op_queue->get_current_settings() == MergeSettings::PREPEND) {
        left_table = op_queue->construct_current_ultra_ops_subtable_columns(); // t
        right_table = op_queue->construct_previous_ultra_ops_table_columns();  // T_prev
    } else {
        left_table = op_queue->construct_previous_ultra_ops_table_columns();    // T_prev
        right_table = op_queue->construct_current_ultra_ops_subtable_columns(); // t
    }
    // Compute g_j(X)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        left_table_reversed[idx] = left_table[idx].reverse();
    }

    const size_t merged_table_size = merged_table[0].size();

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1341): Once the op queue is fixed, we won't have to
    // send the shift size in the append mode. This is desirable to ensure we don't reveal the number of ecc ops in a
    // subtable when sending a merge proof to the rollup.
    const size_t shift_size = left_table[0].size();
    transcript->send_to_verifier("shift_size", static_cast<uint32_t>(shift_size));

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1473): remove generation of commitment to T_prev
    // Compute commitments [T_prev], [m_j], [g_j], and send to the verifier
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Note: This is hacky at the moment because the prover still needs to commit to T_prev. Once we connect two
        // steps of the Merge, T_prev will not be sent by the Merge prover, so the following lines will be removed
        if (op_queue->get_current_settings() == MergeSettings::PREPEND) {
            transcript->send_to_verifier("T_PREV" + std::to_string(idx), pcs_commitment_key.commit(right_table[idx]));
        } else {
            transcript->send_to_verifier("T_PREV" + std::to_string(idx), pcs_commitment_key.commit(left_table[idx]));
        }
        transcript->send_to_verifier("MERGED_TABLE_" + std::to_string(idx),
                                     pcs_commitment_key.commit(merged_table[idx]));
        transcript->send_to_verifier("LEFT_TABLE_REVERSED_" + std::to_string(idx),
                                     pcs_commitment_key.commit(left_table_reversed[idx]));
    }

    // Compute evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF pow_kappa = kappa.pow(shift_size);
    const FF kappa_inv = kappa.invert();

    // Opening claims for each polynomial p_j, l_j, g_j
    //
    // The opening claims are sent in the following order:
    // {kappa, 0}, {kappa, 0}, {kappa, 0}, {kappa, 0},
    //      {1/kappa, l_1(1/kappa)}, {kappa, g_1(kappa)},
    //          {1/kappa, l_2(1/kappa)}, {kappa, g_2(kappa)},
    //              {1/kappa, l_3(1/kappa)}, {kappa, g_3(kappa)},
    //                  {1/kappa, l_4(1/kappa)}, {kappa, g_4(kappa)}
    std::vector<OpeningClaim> opening_claims;

    // Set opening claims p_j(\kappa) = l_j(X) + kappa^l r_j(X) - m_j(X)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        Polynomial partially_evaluated_difference(merged_table_size);
        partially_evaluated_difference += left_table[idx];
        partially_evaluated_difference.add_scaled(right_table[idx], pow_kappa);
        partially_evaluated_difference -= merged_table[idx];

        opening_claims.emplace_back(OpeningClaim{ partially_evaluated_difference, { kappa, FF(0) } });
    }
    // Compute evaluation l_j(1/kappa), g_j(\kappa), send to verifier, and set opening claims
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation;

        // Evaluate l_j(1/kappa)
        evaluation = left_table[idx].evaluate(kappa_inv);
        transcript->send_to_verifier("left_table_eval_kappa_inv_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ left_table[idx], { kappa_inv, evaluation } });

        // Evaluate g_j(\kappa)
        evaluation = left_table_reversed[idx].evaluate(kappa);
        transcript->send_to_verifier("left_table_reversed_eval" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ left_table_reversed[idx], { kappa, evaluation } });
    }

    // Shplonk prover
    OpeningClaim shplonk_opening_claim = ShplonkProver::prove(pcs_commitment_key, opening_claims, transcript);

    // KZG prover
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}
} // namespace bb
