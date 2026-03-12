// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "batch_merge_prover.hpp"

#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include <algorithm>

namespace bb {

template <size_t BATCH_SIZE>
BatchMergeProver<BATCH_SIZE>::BatchMergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                                               std::shared_ptr<Transcript> transcript,
                                               size_t max_subtables)
    : transcript(std::move(transcript))
    , op_queue(op_queue)
    , max_subtables(max_subtables)
{
    // The commitment key must be large enough for the full merged table.
    pcs_commitment_key = CommitmentKey(BATCH_SIZE * op_queue->get_ultra_ops_table_num_rows());
}

template <size_t BATCH_SIZE>
BatchMergeProver<BATCH_SIZE>::Polynomial BatchMergeProver<BATCH_SIZE>::interleave_polynomials(
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
typename BatchMergeProver<BATCH_SIZE>::Batch BatchMergeProver<BATCH_SIZE>::compute_degree_check_polynomial(
    const std::vector<PolynomialBatch>& subtable_columns,
    const std::vector<FF>& degree_check_challenges,
    const size_t max_size)
{
    // Zero initialization
    Batch reversed_batched_columns;
    for (auto& poly : reversed_batched_columns) {
        poly = Polynomial(max_size);
    }

    // Add scaled columns in reverse order

    // Iterate over the subtables
    for (size_t idx = 0; idx < subtable_columns.size(); idx++) {
        // Iterate over the columns for each subtable
        for (size_t jdx = 0; jdx < NUM_COLUMNS; jdx++) {
            // The challenge for degree batching is dependent on the column index
            const FF challenge = degree_check_challenges[(idx * NUM_COLUMNS) + jdx];
            // Iterate over the number of element in each column (BATCH_SIZE) and add to the reversed batched column
            for (size_t b = 0; b < BATCH_SIZE; b++) {
                reversed_batched_columns[BATCH_SIZE - b - 1].add_scaled(subtable_columns[idx][jdx][b], challenge);
            }
        }
    }

    // Reverse the single polys
    for (auto& poly : reversed_batched_columns) {
        poly = poly.reverse();
    }

    return reversed_batched_columns;
}

/**
 * @brief Construct the batch merge proof.
 *
 * @details Proves that the full merged table T is the correct concatenation of all N subtables
 * C_0, ..., C_{N-1} (deque order: C_0 most recently prepended, C_{N-1} oldest) stored in the op_queue.
 *
 * Proof structure:
 *   Prover → Verifier: shift_size_0..shift_size_{N-1}, [T]
 *   Verifier → Prover: degree check challenges α_0..α_{M-1}
 *   Prover → Verifier: [G]
 *   Verifier → Prover: Shplonk batching challenges, κ
 *   Prover → Verifier: C_i(κ) for each i, T(κ), G(κ^{-1})
 *   Prover → Verifier: [Q] (Shplonk quotient)
 *   Verifier → Prover: z (KZG opening challenge)
 *   Prover → Verifier: [W] (KZG opening proof)
 */
template <size_t BATCH_SIZE>
typename BatchMergeProver<BATCH_SIZE>::MergeProof BatchMergeProver<BATCH_SIZE>::construct_proof()
{
    const size_t N = op_queue->get_num_subtables(); // actual number of subtables)
    const size_t M = max_subtables;
    BB_ASSERT_LTE(N, M, "BatchMergeProver: more subtables than max_subtables");

    // -------------------------------------------------------------------------
    // Step 1: Gather subtable column polynomials and their shift sizes
    // -------------------------------------------------------------------------
    // subtable_cols[i] = PolynomialBatch for subtable i (deque order)
    std::vector<PolynomialBatch> subtable_cols(N);
    std::vector<size_t> shift_sizes(N);
    for (size_t i = 0; i < N; ++i) {
        subtable_cols[i] = PolynomialBatch(op_queue->construct_individual_subtable_columns(i));
        shift_sizes[i] = subtable_cols[i][0][0].size(); // number of rows per poly (before interleaving)
    }
    size_t max_shift_size = *std::ranges::max_element(shift_sizes);

    // Send N and shift sizes to the verifier
    transcript->send_to_verifier("batch_merge_num_subtables", static_cast<uint32_t>(N));
    for (size_t i = 0; i < N; ++i) {
        transcript->send_to_verifier("batch_merge_shift_size_" + std::to_string(i),
                                     static_cast<uint32_t>(shift_sizes[i]));
    }

    // -------------------------------------------------------------------------
    // Step 2: Commit to columns to be merged
    // -------------------------------------------------------------------------
    for (size_t idx = 0; idx < N; ++idx) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            transcript->send_to_verifier("COLUMN_" + std::to_string(col + (idx * NUM_COLUMNS)),
                                         pcs_commitment_key.commit_interleaved<BATCH_SIZE>(subtable_cols[idx][col]));
        }
    }

    // -------------------------------------------------------------------------
    // Step 2: Construct and commit to T (full merged table)
    // -------------------------------------------------------------------------
    PolynomialBatch merged_table(op_queue->construct_ultra_ops_table_columns());
    const size_t merged_size = merged_table[0][0].size(); // number of rows in T per wire

    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        transcript->send_to_verifier("BATCH_MERGED_TABLE_" + std::to_string(col),
                                     pcs_commitment_key.commit_interleaved<BATCH_SIZE>(merged_table[col]));
    }

    // -------------------------------------------------------------------------
    // Step 3: Compute degree check batching challenges α_0..α_{NUM_COLUMNS * M - 1}
    // -------------------------------------------------------------------------
    std::vector<std::string> alpha_labels;
    alpha_labels.reserve(NUM_COLUMNS * M);
    for (size_t i = 0; i < NUM_COLUMNS * M; ++i) {
        alpha_labels.emplace_back("BATCH_MERGE_DEGREE_CHECK_" + std::to_string(i));
    }
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(alpha_labels);

    // -------------------------------------------------------------------------
    // Step 4: Compute G = sum_i α_i * C_i(1 / X) * X^{k_max}, commit, send [G]
    // -------------------------------------------------------------------------
    Batch reversed_batched_cols =
        compute_degree_check_polynomial(subtable_cols, degree_check_challenges, max_shift_size);
    transcript->send_to_verifier("BATCH_MERGE_REVERSED_COLUMNS",
                                 pcs_commitment_key.commit_interleaved<BATCH_SIZE>(reversed_batched_cols));

    // -------------------------------------------------------------------------
    // Step 5: Compute Shplonk batching challenges
    //   β_0..β_{N-1}: for C_i(κ) (one per subtable per column = N * NUM_COLUMNS)
    //   β_N: for T(κ)  (one per column = NUM_COLUMNS)
    //   β_{N+1}: for G(κ^{-1}) (one)
    // We use a flat list of (N + 1) * NUM_COLUMNS + 1 challenges.
    // -------------------------------------------------------------------------
    const size_t num_shplonk_challenges = (N + 1) * NUM_COLUMNS + 1;
    std::vector<std::string> beta_labels;
    beta_labels.reserve(num_shplonk_challenges);
    for (size_t i = 0; i < num_shplonk_challenges; ++i) {
        beta_labels.emplace_back("BATCH_MERGE_SHPLONK_" + std::to_string(i));
    }
    std::vector<FF> betas = transcript->template get_challenges<FF>(beta_labels);

    // -------------------------------------------------------------------------
    // Step 6: Evaluation challenge κ
    // -------------------------------------------------------------------------
    const FF kappa = transcript->template get_challenge<FF>("batch_merge_kappa");
    const FF kappa_inv = kappa.invert();

    std::vector<FF> powers_of_kappa = { FF(1) };
    for (size_t b = 0; b < BATCH_SIZE; ++b) {
        powers_of_kappa.emplace_back(powers_of_kappa.back() * kappa);
    }
    std::vector<FF> powers_of_kappa_inv = { FF(1) };
    for (size_t b = 0; b < BATCH_SIZE; ++b) {
        powers_of_kappa_inv.emplace_back(powers_of_kappa_inv.back() * kappa_inv);
    }

    // -------------------------------------------------------------------------
    // Step 7: Compute and send evaluations C_i(κ), T(κ), G(κ^{-1})
    // -------------------------------------------------------------------------
    // c_evals[i][col] = C_i_col(κ)
    std::vector<std::vector<FF>> c_evals(N, std::vector<FF>(NUM_COLUMNS));
    for (size_t i = 0; i < N; ++i) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            c_evals[i][col] = subtable_cols[i].evaluate(col, powers_of_kappa);
            transcript->send_to_verifier("BATCH_MERGE_C_EVAL_" + std::to_string(i) + "_" + std::to_string(col),
                                         c_evals[i][col]);
        }
    }

    // t_evals[col] = T_col(κ)
    std::vector<FF> t_evals(NUM_COLUMNS);
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        t_evals[col] = merged_table.evaluate(col, powers_of_kappa);
        transcript->send_to_verifier("BATCH_MERGE_T_EVAL_" + std::to_string(col), t_evals[col]);
    }

    // g_evals[col] = G_col(κ^{-1})
    FF reversed_cols_evals = reversed_batched_cols.evaluate(powers_of_kappa_inv);
    transcript->send_to_verifier("BATCH_MERGE_REVERSED_COLS_EVAL", reversed_cols_evals);

    // -------------------------------------------------------------------------
    // Step 8: Construct the Shplonk batched quotient Q
    //
    //   Q(X) = [sum_i β_i*(C_i - c_i) + β_T*(T - t)] / (X - κ)
    //         + [β_G*(G - g)] / (X - κ^{-1})
    //
    // We work column-by-column. Each C_i/T/G is an interleaved polynomial.
    // The batched-at-kappa poly and batched-at-kappa-inv poly are computed,
    // then both divided by their respective linear factors and summed.
    // -------------------------------------------------------------------------
    const size_t q_size = BATCH_SIZE * merged_size;
    Polynomial shplonk_batched_quotient(q_size);

    // For the interleaved batched polynomial at κ: sum contributions from all C_i and T
    // interleaved_at_kappa(X) = sum_{col} sum_i β_{i*NUM_COLUMNS+col} * (C_i_il[col](X) - c_i[col])
    //                           + sum_{col} β_{N*NUM_COLUMNS+col} * (T_il[col](X) - t[col])
    Polynomial interleaved_at_kappa(q_size);
    {
        // Subtables
        for (size_t i = 0; i < N; ++i) {
            for (size_t col = 0; col < NUM_COLUMNS; ++col) {
                const FF beta = betas[i * NUM_COLUMNS + col];
                Polynomial C_il = interleave_polynomials(subtable_cols[i][col]); // size k_i * BATCH_SIZE
                interleaved_at_kappa.add_scaled(C_il, beta);
                interleaved_at_kappa.at(0) -= c_evals[i][col] * beta;
            }
        }
        // Merged table
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            const FF beta = betas[N * NUM_COLUMNS + col];
            Polynomial T_il = interleave_polynomials(merged_table[col]);
            interleaved_at_kappa.add_scaled(T_il, beta);
            interleaved_at_kappa.at(0) -= t_evals[col] * beta;
        }
    }
    Polynomial q_kappa = interleaved_at_kappa; // copy before factor_roots mutates
    q_kappa.factor_roots(kappa);
    shplonk_batched_quotient += q_kappa;

    // interleaved_at_kappa_inv(X) = sum_{col} β_{(N+1)*NUM_COLUMNS+col} * (G_il[col](X) - g[col])
    Polynomial interleaved_at_kappa_inv(q_size);
    const FF beta_reversed = betas.back();
    Polynomial reversed_interleaved = interleave_polynomials(reversed_batched_cols);
    interleaved_at_kappa_inv.add_scaled(reversed_interleaved, beta_reversed);
    interleaved_at_kappa_inv.at(0) -= reversed_cols_evals * beta_reversed;
    Polynomial q_kappa_inv = interleaved_at_kappa_inv;
    q_kappa_inv.factor_roots(kappa_inv);
    shplonk_batched_quotient += q_kappa_inv;

    transcript->send_to_verifier("BATCH_MERGE_SHPLONK_Q", pcs_commitment_key.commit(shplonk_batched_quotient));

    // -------------------------------------------------------------------------
    // Step 9: Shplonk opening challenge z and KZG opening
    // -------------------------------------------------------------------------
    const FF z = transcript->template get_challenge<FF>("batch_merge_z");

    // Q'(X) = -Q(X)*(z - κ)
    //         + interleaved_at_kappa(X)
    //         + (z - κ) / (z - κ^{-1}) * interleaved_at_kappa_inv(X)
    shplonk_batched_quotient *= -(z - kappa);
    OpeningClaim opening_claim{ std::move(shplonk_batched_quotient), { z, FF(0) } };
    opening_claim.polynomial.add_scaled(interleaved_at_kappa, FF(1));
    opening_claim.polynomial.add_scaled(interleaved_at_kappa_inv, (z - kappa) * (z - kappa_inv).invert());

    PCS::compute_opening_proof(pcs_commitment_key, opening_claim, transcript);

    return transcript->export_proof();
}

template class BatchMergeProver<1>;
template class BatchMergeProver<4>;

} // namespace bb
