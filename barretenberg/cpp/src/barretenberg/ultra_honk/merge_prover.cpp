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
                         CommitmentKey commitment_key,
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
 *      \f[ x^{l-1} t_j(1/x) = g_j(x) \f]
 *   where \f$g_j(X) = X^{l-1} t_j(1 / X)\f$.
 *
 * @note: the prover doesn't commit to t_j because it shares a transcript with the PG instance that folds the present
 * circuit, and therefore t_j has already been added to the transcript by PG.
 *
 * @return honk::proof
 */
MergeProver::MergeProof MergeProver::construct_proof()
{

    // Extract columns of the full table T_j, the previous table T_{j,prev}, and the current subtable t_j
    std::array<Polynomial, NUM_WIRES> T_current = op_queue->construct_ultra_ops_table_columns();
    std::array<Polynomial, NUM_WIRES> T_prev = op_queue->construct_previous_ultra_ops_table_columns();
    std::array<Polynomial, NUM_WIRES> t_current = op_queue->construct_current_ultra_ops_subtable_columns();

    const size_t current_table_size = T_current[0].size();
    const size_t current_subtable_size = t_current[0].size();

    // Compute g_j(X) = X^{l-1} t_j(1/X)
    std::array<Polynomial, NUM_WIRES> inverted_t_current;
    for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
        Polynomial tmp(current_subtable_size, current_subtable_size);
        for (size_t idx = 0; idx < current_subtable_size; ++idx) {
            tmp.at(idx) = t_current[wire_idx].at(current_subtable_size - 1 - idx);
        }
        inverted_t_current[wire_idx] = tmp;
        // for (auto& coeff : t_current[wire_idx].coeffs()) {
        //     info("t: ", coeff);
        // }
        // for (auto& coeff : inverted_t_current[wire_idx].coeffs()) {
        //     info("inverted: ", coeff);
        // }
    }

    transcript->send_to_verifier("subtable_size", static_cast<uint32_t>(current_subtable_size));

    // Compute/get commitments [t], [T_prev], [T], [inverted_t_current] and add to transcript
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Compute commitments
        Commitment T_prev_commitment = pcs_commitment_key.commit(T_prev[idx]);
        Commitment T_commitment = pcs_commitment_key.commit(T_current[idx]);
        Commitment inverted_t_commitment = pcs_commitment_key.commit(inverted_t_current[idx]);

        std::string suffix = std::to_string(idx);
        transcript->send_to_verifier("T_PREV_" + suffix, T_prev_commitment);
        transcript->send_to_verifier("T_CURRENT_" + suffix, T_commitment);
        transcript->send_to_verifier("INVERTED_t_CURRENT" + suffix, inverted_t_commitment);
    }

    // Evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    auto minus_pow_kappa = -kappa.pow(current_subtable_size);
    auto kappa_inv = kappa.invert();

    // Compute p_j(X) = t_j(X) - kappa^l T_{j,prev}(X) - T(X)
    std::array<Polynomial, NUM_WIRES> partially_computed_difference;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        Polynomial tmp(current_table_size);
        tmp += t_current[idx];
        tmp.add_scaled(T_prev[idx], minus_pow_kappa);
        tmp -= T_current[idx];
        partially_computed_difference[idx] = tmp;
    }

    // Add univariate opening claims for each polynomial p_j, g_j, t_j
    std::vector<OpeningClaim> opening_claims;
    // Compute evaluation t(\kappa) and add to transcript
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = t_current[idx].evaluate(kappa);
        transcript->send_to_verifier("t_eval_" + std::to_string(idx), evaluation);
    }
    // Compute evaluation T_prev(\kappa) and add to transcript
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = T_prev[idx].evaluate(kappa);
        transcript->send_to_verifier("T_prev_eval_" + std::to_string(idx), evaluation);
    }
    // Compute evaluation T(\kappa) and add to transcript
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = T_current[idx].evaluate(kappa);
        transcript->send_to_verifier("T_eval_" + std::to_string(idx), evaluation);
    }
    // Set opening claims p(\kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        opening_claims.emplace_back(OpeningClaim{ std::move(partially_computed_difference[idx]), { kappa, FF(0) } });
    }
    // Compute evaluation g(\kappa), add to transcript, and set opening claim
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = inverted_t_current[idx].evaluate(kappa);
        transcript->send_to_verifier("inverted_t_eval_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ std::move(inverted_t_current[idx]), { kappa, evaluation } });
    }
    // Compute evaluation t(1/\kappa), add to transcript, and set opening claim
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = t_current[idx].evaluate(kappa_inv);
        transcript->send_to_verifier("t_eval_inv_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ std::move(t_current[idx]), { kappa_inv, evaluation } });
    }

    // Shplonk prover
    auto opening_claim = ShplonkProver::prove(pcs_commitment_key, opening_claims, transcript);

    // KZG prover
    PCS::compute_opening_proof(pcs_commitment_key, opening_claim, transcript);

    return transcript->export_proof();
}
} // namespace bb
