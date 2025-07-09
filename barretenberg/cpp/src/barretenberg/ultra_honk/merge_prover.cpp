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

std::array<std::array<typename MergeProver::Polynomial, MergeProver::NUM_WIRES>, 4> MergeProver::preamble_round()
{
    // Container for table polynomials:
    // t_IDX          -> the subtable t_j
    // T_PREV_IDX     -> the previous table T_{j,prev}
    // T_IDX          -> the full table T_j
    // REVERSED_t_IDX -> the reversed subtable g_j(X) = X^{l-1} t_j(X)
    std::array<std::array<typename MergeProver::Polynomial, MergeProver::NUM_WIRES>, 4> table_polynomials;

    table_polynomials[t_IDX] = op_queue->construct_current_ultra_ops_subtable_columns();    // t
    table_polynomials[T_PREV_IDX] = op_queue->construct_previous_ultra_ops_table_columns(); // T_prev
    table_polynomials[T_IDX] = op_queue->construct_ultra_ops_table_columns();               // T

    // Compute g_j(X) = X^{l-1} t_j(1/X)
    for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
        table_polynomials[REVERSED_t_IDX][wire_idx] = table_polynomials[t_IDX][wire_idx].reverse();
    }

    // Send subtable size to the verifier
    const size_t subtable_size = table_polynomials[t_IDX][0].size();
    transcript->send_to_verifier("subtable_size", static_cast<uint32_t>(subtable_size));

    // Compute commitments [T_prev], [T], [reversed_t_current], and send to the verifier
    std::array<std::string, 3> labels{ "T_PREV_", "T_", "REVERSED_t_CURRENT_" };
    std::array<size_t, 3> commitment_indices{ T_PREV_IDX, T_IDX, REVERSED_t_IDX };
    for (auto [idx, label] : zip_view(commitment_indices, labels)) {
        for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
            std::string suffix = std::to_string(wire_idx);
            transcript->send_to_verifier(label + suffix, pcs_commitment_key.commit(table_polynomials[idx][wire_idx]));
        }
    }

    return table_polynomials;
}

std::vector<typename MergeProver::OpeningClaim> MergeProver::construct_opening_claims(
    const std::array<std::array<typename MergeProver::Polynomial, MergeProver::NUM_WIRES>, 4>& table_polynomials)
{
    const size_t subtable_size = table_polynomials[t_IDX][0].size();
    const size_t table_size = table_polynomials[T_IDX][0].size();

    // Evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    auto pow_kappa = kappa.pow(subtable_size);
    auto kappa_inv = kappa.invert();

    // Compute p_j(X) = t_j(X) + kappa^l T_{j,prev}(X) - T_j(X)
    std::array<Polynomial, NUM_WIRES> partially_computed_difference;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        Polynomial tmp(table_size);
        tmp += table_polynomials[t_IDX][idx];
        tmp.add_scaled(table_polynomials[T_PREV_IDX][idx], pow_kappa);
        tmp -= table_polynomials[T_IDX][idx];
        partially_computed_difference[idx] = tmp;
    }

    // Add univariate opening claims for each polynomial p_j, g_j, t_j
    std::vector<OpeningClaim> opening_claims;
    // Compute evaluation t_j(1/kappa), send to verifier, and set opening claim
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = table_polynomials[t_IDX][idx].evaluate(kappa_inv);
        transcript->send_to_verifier("t_eval_kappa_inv_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ table_polynomials[t_IDX][idx], { kappa_inv, evaluation } });
    }
    // Set opening claims p_j(\kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        opening_claims.emplace_back(OpeningClaim{ std::move(partially_computed_difference[idx]), { kappa, FF(0) } });
    }
    // Compute evaluation g_j(\kappa), send to verifier, and set opening claim
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = table_polynomials[REVERSED_t_IDX][idx].evaluate(kappa);
        transcript->send_to_verifier("reversed_t_eval_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ table_polynomials[REVERSED_t_IDX][idx], { kappa, evaluation } });
    }

    return opening_claims;
}

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
 * @note The prover doesn't commit to t_j because it shares a transcript with the PG instance that folds the present
 * circuit, and therefore t_j has already been added to the transcript by PG.
 *
 * @return honk::proof
 */
MergeProver::MergeProof MergeProver::construct_proof()
{
    auto table_polynomials = preamble_round();

    auto opening_claims = construct_opening_claims(table_polynomials);

    // Shplonk prover
    auto shplonk_opening_claim = ShplonkProver::prove(pcs_commitment_key, opening_claims, transcript);

    // KZG prover
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}
} // namespace bb
