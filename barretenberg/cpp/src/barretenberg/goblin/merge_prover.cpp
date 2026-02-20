// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "merge_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"

namespace bb {

/**
 * @brief Create MergeProver
 * @details We require an SRS at least as large as the current ultra ecc ops table
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1267): consider possible efficiency improvements
 */
template <size_t BATCH_SIZE>
MergeProver<BATCH_SIZE>::MergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                                     std::shared_ptr<Transcript> transcript,
                                     MergeSettings settings)
    : transcript(std::move(transcript))
    , op_queue(op_queue)
    , settings(settings)
{
    // Merge the current subtable (for which a merge proof is being constructed) prior to
    // procedeing with proving.
    if (settings == MergeSettings::APPEND) {
        size_t last_subtable_size = op_queue->get_current_subtable_size();
        op_queue->merge(settings, ECCOpQueue::OP_QUEUE_SIZE - last_subtable_size);

    } else {
        op_queue->merge(settings);
    }

    pcs_commitment_key = CommitmentKey(BATCH_SIZE * op_queue->get_ultra_ops_table_num_rows());
};

template <size_t BATCH_SIZE>
MergeProver<BATCH_SIZE>::Polynomial MergeProver<BATCH_SIZE>::interleave_polynomials(
    const std::array<Polynomial, BATCH_SIZE>& polys)
{
    size_t poly_size = polys[0].size();
    Polynomial interleaved(poly_size * BATCH_SIZE);
    for (size_t idx = 0; idx < poly_size; idx++) {
        for (size_t batch_idx = 0; batch_idx < BATCH_SIZE; batch_idx++) {
            interleaved.at(idx * BATCH_SIZE + batch_idx) = polys[batch_idx].at(idx);
        }
    }
    return interleaved;
}

template <size_t BATCH_SIZE>
typename MergeProver<BATCH_SIZE>::Batch MergeProver<BATCH_SIZE>::compute_degree_check_polynomial(
    const PolynomialBatch& left_columns, const std::vector<FF>& degree_check_challenges)
{
    // Zero initialization
    Batch reversed_batched_left_columns;
    for (auto& poly : reversed_batched_left_columns) {
        poly = Polynomial(left_columns[0][0].size());
    }

    // Add scaled columns in reverse order
    for (const auto& [batch, challenge] : zip_view(left_columns, degree_check_challenges)) {
        for (size_t idx = 0; idx < BATCH_SIZE; idx++) {
            reversed_batched_left_columns[BATCH_SIZE - idx - 1].add_scaled(batch[idx], challenge);
        }
    }

    // Reverse the single polys
    for (auto& poly : reversed_batched_left_columns) {
        poly = poly.reverse();
    }

    return reversed_batched_left_columns;
}

template <size_t BATCH_SIZE>
MergeProver<BATCH_SIZE>::Polynomial MergeProver<BATCH_SIZE>::compute_interleaved_batched_poly(
    const std::vector<Batch>& columns,
    const std::vector<FF>& batching_challenges,
    const std::vector<FF>& evals,
    size_t max_size)
{
    Batch batched_columns;
    for (auto& poly : batched_columns) {
        poly = Polynomial(max_size);
    }

    for (const auto& [column, batching_challenge, eval] : zip_view(columns, batching_challenges, evals)) {
        for (size_t idx = 0; idx < BATCH_SIZE; idx++) {
            batched_columns[idx].add_scaled(column[idx], batching_challenge);
        }
        batched_columns[0].at(0) -= eval * batching_challenge;
    }

    return interleave_polynomials(batched_columns);
}

template <size_t BATCH_SIZE>
void MergeProver<BATCH_SIZE>::update_shplonk_quotient(Polynomial& quotient,
                                                      const std::array<Polynomial, NUM_WIRES>& tables,
                                                      const std::vector<FF>& batching_challenges,
                                                      const std::vector<FF>& evals,
                                                      const FF& evaluation_point,
                                                      const size_t max_size)
{
    Polynomial batched_poly(max_size);

    for (const auto& [poly, batching_challenge, eval] : zip_view(tables, batching_challenges, evals)) {
        batched_poly.add_scaled(poly, batching_challenge);
        batched_poly.at(0) -= eval * batching_challenge;
    }

    batched_poly.factor_roots(evaluation_point);

    quotient += batched_poly;
}

template <size_t BATCH_SIZE>
void MergeProver<BATCH_SIZE>::update_shplonk_opening_claim(OpeningClaim& opening_claim,
                                                           const std::array<Polynomial, NUM_WIRES>& tables,
                                                           const std::vector<FF>& batching_challenges,
                                                           const std::vector<FF>& evals,
                                                           const FF& scaling_factor,
                                                           const size_t max_size)
{
    Polynomial batched_poly(max_size);

    for (const auto& [poly, batching_challenge, eval] : zip_view(tables, batching_challenges, evals)) {
        batched_poly.add_scaled(poly, batching_challenge);
        batched_poly.at(0) -= eval * batching_challenge;
    }

    opening_claim.polynomial.add_scaled(batched_poly, scaling_factor);
};

/**
 * @brief Prove proper construction of the aggregate Goblin ECC op queue polynomials T_j.
 * @details Proves that M_j(X) = L_j(X) + X^k * R_j(X) and deg(L_j) < k for j = 1,2,3,4.
 * Uses degree-check polynomial G(X) and Shplonk for batched openings.
 *
 * For PREPEND: L = subtable (t), R = previous table (T_prev)
 * For APPEND:  L = previous table (T_prev), R = subtable (t)
 *
 * @see MERGE_PROTOCOL.md for complete protocol specification.
 * @return MergeProver::MergeProof
 */
template <size_t BATCH_SIZE>
typename MergeProver<BATCH_SIZE>::MergeProof MergeProver<BATCH_SIZE>::construct_proof(bool de_interleaving)
{
    std::array<Polynomial, NUM_WIRES> left_table;
    std::array<Polynomial, NUM_WIRES> right_table;
    std::array<Polynomial, NUM_WIRES> merged_table = op_queue->construct_ultra_ops_table_columns(); // T

    if (settings == MergeSettings::PREPEND) {
        left_table = op_queue->construct_current_ultra_ops_subtable_columns(); // t
        right_table = op_queue->construct_previous_ultra_ops_table_columns();  // T_prev
    } else {
        left_table = op_queue->construct_previous_ultra_ops_table_columns();    // T_prev
        right_table = op_queue->construct_current_ultra_ops_subtable_columns(); // t
    }

    PolynomialBatch left_columns(left_table);
    PolynomialBatch right_columns(right_table);
    PolynomialBatch merged_columns(merged_table);

    // Send shift_size to the verifier
    const size_t shift_size = left_table[0].size();
    transcript->send_to_verifier("shift_size", static_cast<uint32_t>(shift_size));

    // Compute commitments [M_j] and send to the verifier
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        transcript->send_to_verifier("MERGED_TABLE_" + std::to_string(idx),
                                     pcs_commitment_key.commit_interleaved<BATCH_SIZE>(merged_columns[idx]));
    }

    // Generate degree check batching challenges, batch polynomials, compute reversed polynomial, send commitment to
    // the verifier
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(labels_degree_check());
    Batch reversed_batched_left_columns = compute_degree_check_polynomial(left_columns, degree_check_challenges);
    transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES",
                                 pcs_commitment_key.commit_interleaved<BATCH_SIZE>(reversed_batched_left_columns));

    // Send commitments to de interleaving of merged columns
    if (de_interleaving) {
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            transcript->send_to_verifier("DE_INTERLEAVED_MERGED_TABLE_" + std::to_string(idx),
                                         pcs_commitment_key.commit(merged_table[idx]));
        }
    }

    // Compute batching challenges
    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_challenges<FF>(labels_shplonk_batching_challenges(3 * NUM_COLUMNS + 1));

    std::vector<FF> shplonk_de_interleaving_batching_challenges;
    if (de_interleaving) {
        shplonk_de_interleaving_batching_challenges =
            transcript->template get_challenges<FF>(labels_shplonk_batching_challenges(NUM_WIRES));
    }

    // Compute evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    std::vector<FF> powers_of_kappa = { 1 };
    for (size_t idx = 0; idx < BATCH_SIZE; ++idx) {
        powers_of_kappa.emplace_back(powers_of_kappa.back() * kappa);
    }
    const FF kappa_inv = kappa.invert();
    std::vector<FF> powers_of_kappa_inv = { 1 };
    for (size_t idx = 0; idx < BATCH_SIZE; ++idx) {
        powers_of_kappa_inv.emplace_back(powers_of_kappa_inv.back() * kappa_inv);
    }

    // Send evaluations of [Lᵢ], [Rᵢ], [Mᵢ] at κ
    std::vector<FF> columns_evals;
    columns_evals.reserve(3 * NUM_COLUMNS);
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        columns_evals.emplace_back(left_columns.evaluate(idx, powers_of_kappa));
        transcript->send_to_verifier("LEFT_TABLE_EVAL_" + std::to_string(idx), columns_evals.back());
    }
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        columns_evals.emplace_back(right_columns.evaluate(idx, powers_of_kappa));
        transcript->send_to_verifier("RIGHT_TABLE_EVAL_" + std::to_string(idx), columns_evals.back());
    }
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        columns_evals.emplace_back(merged_columns.evaluate(idx, powers_of_kappa));
        transcript->send_to_verifier("MERGED_TABLE_EVAL_" + std::to_string(idx), columns_evals.back());
    }

    // Send evaluation of G at 1/κ
    FF inverse_eval = reversed_batched_left_columns.evaluate(powers_of_kappa_inv);
    transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES_EVAL", inverse_eval);

    // Send evals of de interleaved merged columns
    std::vector<FF> evals_de_interleaving;
    if (de_interleaving) {
        for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
            FF eval = merged_table[idx].evaluate(powers_of_kappa.back());
            evals_de_interleaving.emplace_back(eval);
            transcript->send_to_verifier("DE_INTERLEAVED_MERGED_TABLE_EVAL_" + std::to_string(idx), eval);
        }
    }

    // Compute Shplonk batched quotient
    std::vector<Batch> columns;
    std::vector<FF> batching_challenges(shplonk_batching_challenges.begin(),
                                        shplonk_batching_challenges.begin() + (3 * NUM_COLUMNS));
    columns.reserve(3 * NUM_COLUMNS);
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        columns.emplace_back(std::move(left_columns[idx]));
    }
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        columns.emplace_back(std::move(right_columns[idx]));
    }
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        columns.emplace_back(std::move(merged_columns[idx]));
    }

    // Precompute the batched-and-interleaved polynomials once; they are reused for both the
    // Shplonk quotient and the opening claim
    const size_t max_size = merged_columns[0][0].size();
    const size_t rev_max_size = reversed_batched_left_columns[0].size();
    Polynomial interleaved_cols =
        compute_interleaved_batched_poly(columns, batching_challenges, columns_evals, max_size);
    Polynomial interleaved_rev = compute_interleaved_batched_poly(
        { reversed_batched_left_columns }, { shplonk_batching_challenges.back() }, { inverse_eval }, rev_max_size);

    // Compute Shplonk batched quotient
    Polynomial shplonk_batched_quotient(BATCH_SIZE * max_size);
    {
        // Add contribution to from the columns (batched columns / X - kappa)
        Polynomial q = interleaved_cols; // copy: factor_roots mutates in-place
        q.factor_roots(kappa);
        shplonk_batched_quotient += q;
    }
    {
        // Add contribution from the reverse columns used for the degree check (batched reverse columns / X - 1/kappa)
        Polynomial q = interleaved_rev; // copy: factor_roots mutates in-place
        q.factor_roots(kappa_inv);
        shplonk_batched_quotient += q;
    }
    if (de_interleaving) {
        // Add contribution from de-interleaving merged columns (batched de-interleaved columns / X - kappa^BATCH_SIZE)
        update_shplonk_quotient(shplonk_batched_quotient,
                                merged_table,
                                shplonk_de_interleaving_batching_challenges,
                                evals_de_interleaving,
                                powers_of_kappa.back(),
                                merged_table[0].size());
    }

    transcript->send_to_verifier("SHPLONK_BATCHED_QUOTIENT", pcs_commitment_key.commit(shplonk_batched_quotient));

    // Generate Shplonk opening challenge
    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("shplonk_opening_challenge");

    // Compute Shplonk opening claim

    // Rescale Shplonk quotient
    shplonk_batched_quotient *= -(shplonk_opening_challenge - kappa);
    OpeningClaim shplonk_opening_claim_ =
        OpeningClaim{ std::move(shplonk_batched_quotient), { shplonk_opening_challenge, FF(0) } };
    // Add contribution from the columns
    shplonk_opening_claim_.polynomial.add_scaled(interleaved_cols, FF(1));
    // Add contribution from the reverse columns (scale the poly by (z - kappa) / (z - 1/kappa))
    shplonk_opening_claim_.polynomial.add_scaled(
        interleaved_rev, (shplonk_opening_challenge - kappa) * (shplonk_opening_challenge - kappa_inv).invert());
    if (de_interleaving) {
        // Add contribution from de-interleaving merged columns (scale by (z - kappa) / (z - kappa^BATCH_SIZE))
        update_shplonk_opening_claim(shplonk_opening_claim_,
                                     merged_table,
                                     shplonk_de_interleaving_batching_challenges,
                                     evals_de_interleaving,
                                     (shplonk_opening_challenge - kappa) *
                                         (shplonk_opening_challenge - powers_of_kappa.back()).invert(),
                                     merged_table[0].size());
    }

    // KZG prover
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim_, transcript);

    return transcript->export_proof();
}

template class MergeProver<1>;
template class MergeProver<2>;
template class MergeProver<4>;
} // namespace bb
