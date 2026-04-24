// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "batch_merge_prover.hpp"

#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include <algorithm>

namespace bb {

BatchMergeProver::BatchMergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                                   std::shared_ptr<Transcript> transcript,
                                   size_t max_subtables,
                                   bool is_zk)
    : transcript(std::move(transcript))
    , op_queue(op_queue)
    , max_subtables(max_subtables)
    , is_zk(is_zk)
{
    // The commitment key must be large enough for the full merged table (plus the zk offset).
    pcs_commitment_key =
        CommitmentKey(op_queue->get_ultra_ops_table_num_rows() + (is_zk ? UltraEccOpsTable::ZK_ULTRA_OPS : 0));
}

typename BatchMergeProver::Polynomial BatchMergeProver::compute_degree_check_polynomial(
    const std::vector<Polynomial>& flattened_columns,
    const std::vector<FF>& degree_check_challenges,
    const size_t max_size)
{
    // Zero initialization
    Polynomial reversed_batched_poly(max_size);

    // Iterate over the flattened columns
    for (size_t idx = 0; idx < flattened_columns.size(); ++idx) {
        const Polynomial& poly = flattened_columns[idx];
        const FF challenge = degree_check_challenges[idx];
        reversed_batched_poly.add_scaled(poly.reverse(), challenge);
    }

    return reversed_batched_poly;
}

BatchMergeProver::Polynomial BatchMergeProver::compute_shplonk_batched_quotient(
    const std::vector<Polynomial>& flattened_columns,
    const std::array<Polynomial, NUM_WIRES>& merged_table,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    const Polynomial& degree_check_poly,
    const std::vector<FF>& evals) const
{
    // Q such that Q·(X - κ)·(X - κ⁻¹) = (X - κ⁻¹)·(Σᵢⱼ βᵢⱼ(Tᵢⱼ - tᵢⱼ) + Σⱼ βᴹⱼ(Mⱼ - mⱼ)) + (X - κ)·βᴳ(G - g)
    const size_t M = max_subtables;
    const size_t merged_table_challenge_offset = (M * NUM_WIRES) + (is_zk ? NUM_WIRES : 0);
    Polynomial shplonk_batched_quotient(merged_table[0].size());

    for (size_t idx = 0; idx < flattened_columns.size(); ++idx) {
        const FF& challenge = shplonk_batching_challenges[idx];
        const FF& eval = evals[idx];
        shplonk_batched_quotient.add_scaled(flattened_columns[idx], challenge);
        if (!shplonk_batched_quotient.is_empty()) {
            shplonk_batched_quotient.at(0) -= challenge * eval;
        }
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        const size_t offset_idx = merged_table_challenge_offset + idx;
        const FF& challenge = shplonk_batching_challenges[offset_idx];
        const FF& eval = evals[offset_idx];
        shplonk_batched_quotient.add_scaled(merged_table[idx], challenge);
        if (!shplonk_batched_quotient.is_empty()) {
            shplonk_batched_quotient.at(0) -= challenge * eval;
        }
    }

    // Q /= (X - κ)
    shplonk_batched_quotient.factor_roots(kappa);

    // Add (G - g)/(X - κ⁻¹)·β^G
    Polynomial degree_check_poly_copy(degree_check_poly);
    if (!degree_check_poly_copy.is_empty()) {
        degree_check_poly_copy.at(0) -= evals.back();
    }
    degree_check_poly_copy.factor_roots(kappa_inv);
    shplonk_batched_quotient.add_scaled(degree_check_poly_copy, shplonk_batching_challenges.back());

    return shplonk_batched_quotient;
}

BatchMergeProver::OpeningClaim BatchMergeProver::compute_shplonk_opening_claim(
    Polynomial& shplonk_batched_quotient,
    const FF& shplonk_opening_challenge,
    const std::vector<Polynomial>& flattened_columns,
    const std::array<Polynomial, NUM_WIRES>& merged_table,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    Polynomial& degree_check_poly,
    const std::vector<FF>& evals) const
{
    // Q' (partially evaluated batched quotient) =
    //   -Q·(z - κ) + Σᵢⱼ βᵢⱼ(Tᵢⱼ - tᵢⱼ) + Σⱼ βᴹⱼ(Mⱼ - mⱼ) + (z - κ)/(z - κ⁻¹)·βᴳ(G - g)
    const size_t M = max_subtables;
    const size_t merged_table_challenge_offset = (M * NUM_WIRES) + (is_zk ? NUM_WIRES : 0);
    Polynomial shplonk_partially_evaluated(std::move(shplonk_batched_quotient));
    shplonk_partially_evaluated *= -(shplonk_opening_challenge - kappa);

    for (size_t idx = 0; idx < flattened_columns.size(); ++idx) {
        const FF& challenge = shplonk_batching_challenges[idx];
        const FF& eval = evals[idx];
        shplonk_partially_evaluated.add_scaled(flattened_columns[idx], challenge);
        if (!shplonk_partially_evaluated.is_empty()) {
            shplonk_partially_evaluated.at(0) -= challenge * eval;
        }
    }

    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        const size_t offset_idx = merged_table_challenge_offset + idx;
        const FF& challenge = shplonk_batching_challenges[offset_idx];
        const FF& eval = evals[offset_idx];
        shplonk_partially_evaluated.add_scaled(merged_table[idx], challenge);
        if (!shplonk_partially_evaluated.is_empty()) {
            shplonk_partially_evaluated.at(0) -= challenge * eval;
        }
    }

    // Add (G - g)·(z - κ)/(z - κ⁻¹)·β^G
    if (!degree_check_poly.is_empty()) {
        degree_check_poly.at(0) -= evals.back();
    }
    shplonk_partially_evaluated.add_scaled(degree_check_poly,
                                           shplonk_batching_challenges.back() * (shplonk_opening_challenge - kappa) *
                                               (shplonk_opening_challenge - kappa_inv).invert());

    OpeningClaim shplonk_opening_claim = { .polynomial = std::move(shplonk_partially_evaluated),
                                           .opening_pair = { shplonk_opening_challenge, FF(0) } };

    return shplonk_opening_claim;
}

typename BatchMergeProver::MergeProof BatchMergeProver::construct_proof()
{
    const size_t M = max_subtables;

    // -------------------------------------------------------------------------
    // Step 1: Gather subtable column polynomials and their shift sizes
    // -------------------------------------------------------------------------
    std::vector<std::array<Polynomial, NUM_WIRES>> subtable_cols = op_queue->construct_subtable_columns();

    size_t N = subtable_cols.size();
    BB_ASSERT_LTE(N, M, "BatchMergeProver: more subtables than max_subtables");

    std::vector<size_t> shift_sizes(N);
    size_t max_shift_size = 0;
    for (size_t i = 0; i < N; ++i) {
        shift_sizes[i] = subtable_cols[i][0].size(); // number of rows per poly
        max_shift_size = std::max(max_shift_size, shift_sizes[i]);
    }

    // -------------------------------------------------------------------------
    // Step 2: Commit to columns to be merged
    // -------------------------------------------------------------------------
    for (size_t idx = 0; idx < N; ++idx) {
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            transcript->send_to_verifier("COLUMN_" + std::to_string(col) + "_" + std::to_string(idx),
                                         pcs_commitment_key.commit(subtable_cols[idx][col]));
        }
        // update hash after each subtable to match verifier's transcript
        FF _ = transcript->template get_challenge<FF>("HASH_" + std::to_string(idx));
    }

    Polynomial zero_poly = Polynomial(0);
    for (size_t idx = N; idx < M; ++idx) {
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            transcript->send_to_verifier("COLUMN_" + std::to_string(col) + "_" + std::to_string(idx),
                                         pcs_commitment_key.commit(zero_poly));
        }
        // update hash after each subtable to match verifier's transcript
        FF _ = transcript->template get_challenge<FF>("HASH_" + std::to_string(idx));
    }

    // -------------------------------------------------------------------------
    // Step 2.b: If zk, send the masking table
    // -------------------------------------------------------------------------
    std::array<Polynomial, NUM_WIRES> zk_columns;
    if (is_zk) {
        zk_columns = op_queue->construct_zk_columns();
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            transcript->send_to_verifier("ZK_COLUMN_" + std::to_string(col),
                                         pcs_commitment_key.commit(zk_columns[col]));
        }

        max_shift_size = std::max(max_shift_size, zk_columns[0].size());
    }

    // -------------------------------------------------------------------------
    // Step 2.c: Flatten the columns for easier utilisation
    // -------------------------------------------------------------------------
    std::vector<Polynomial> flattened_cols;
    flattened_cols.reserve((subtable_cols.size() * NUM_WIRES) + (is_zk ? NUM_WIRES : 0));
    if (is_zk) {
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            flattened_cols.push_back(std::move(zk_columns[col]));
        }
    }
    for (auto& subtable_col : subtable_cols) {
        for (size_t col = 0; col < NUM_WIRES; col++) {
            flattened_cols.push_back(std::move(subtable_col[col]));
        }
    }

    // -------------------------------------------------------------------------
    // Step 3: Send N and shift sizes to the verifier
    // -------------------------------------------------------------------------
    transcript->send_to_verifier("NUM_SUBTABLES", static_cast<uint32_t>(N));
    for (size_t i = 0; i < M; ++i) {
        transcript->send_to_verifier("SHIFT_SIZE_" + std::to_string(i),
                                     static_cast<uint32_t>(i < N ? shift_sizes[i] : 0));
    }

    // -------------------------------------------------------------------------
    // Step 4: Construct and commit to T (full merged table)
    // -------------------------------------------------------------------------
    std::array<Polynomial, NUM_WIRES> merged_table(op_queue->construct_ultra_ops_table_columns(0, is_zk));
    for (size_t col = 0; col < NUM_WIRES; ++col) {
        transcript->send_to_verifier("MERGED_COLUMN_" + std::to_string(col),
                                     pcs_commitment_key.commit(merged_table[col]));
    }

    // -------------------------------------------------------------------------
    // Step 5: Compute degree check batching challenges 1, α, α^2, .., α^{M * NUM_WIRES -1}
    // -------------------------------------------------------------------------
    const FF degree_check_challenge = transcript->template get_challenge<FF>("DEGREE_CHECK_CHALLENGE");
    const size_t num_degree_check_challenges = (M * NUM_WIRES) + (is_zk ? NUM_WIRES : 0);
    std::vector<FF> degree_check_challenges = { FF(1), degree_check_challenge };
    for (size_t idx = 2; idx < num_degree_check_challenges; idx++) {
        degree_check_challenges.push_back(degree_check_challenges.back() * degree_check_challenge);
    }

    // -------------------------------------------------------------------------
    // Step 6: Compute G = sum_i α_i * C_i(1 / X) * X^{shift_size_i - 1}, commit, send [G]
    // -------------------------------------------------------------------------
    Polynomial degree_check_poly =
        compute_degree_check_polynomial(flattened_cols, degree_check_challenges, max_shift_size);
    transcript->send_to_verifier("DEGREE_CHECK_POLY", pcs_commitment_key.commit(degree_check_poly));

    // -------------------------------------------------------------------------
    // Step 7: Compute Shplonk batching challenges
    //   α: for zk columns (one per column = NUM_WIRES)
    //   β_0..β_{M-1}: for C_i(κ) (one per subtable per column = M * NUM_WIRES)
    //   β_M: for T(κ)  (one per column = NUM_WIRES)
    //   β_{M+1}: for G(κ^{-1}) (one)
    // -------------------------------------------------------------------------
    const size_t num_shplonk_challenges = ((M + 1) * NUM_WIRES) + 1 + (is_zk ? NUM_WIRES : 0);
    const FF shplonk_batching_challenge = transcript->template get_challenge<FF>("SHPLONK_BATCHING_CHALLENGE");
    std::vector<FF> shplonk_challenges = { FF(1), shplonk_batching_challenge };
    for (size_t idx = 2; idx < num_shplonk_challenges; idx++) {
        shplonk_challenges.push_back(shplonk_challenges.back() * shplonk_batching_challenge);
    }

    // -------------------------------------------------------------------------
    // Step 8: Evaluation challenge κ
    // -------------------------------------------------------------------------
    const FF kappa = transcript->template get_challenge<FF>("KAPPA");
    const FF kappa_inv = kappa.invert();

    // -------------------------------------------------------------------------
    // Step 9: Compute and send evaluations C_i(κ), T(κ), G(κ^{-1})
    // -------------------------------------------------------------------------
    // C_i_col(κ)
    std::vector<FF> evals;
    const size_t num_actual_flattened_cols = (N * NUM_WIRES) + (is_zk ? NUM_WIRES : 0);
    const size_t num_flattened_col_evals = (M * NUM_WIRES) + (is_zk ? NUM_WIRES : 0);
    for (size_t col = 0; col < num_flattened_col_evals; ++col) {
        evals.push_back(col < num_actual_flattened_cols ? flattened_cols[col].evaluate(kappa) : FF(0));
        transcript->send_to_verifier("C_EVAL_" + std::to_string(col), evals.back());
    }

    // T_col(κ)
    for (size_t col = 0; col < NUM_WIRES; ++col) {
        evals.push_back(merged_table[col].evaluate(kappa));
        transcript->send_to_verifier("MERGED_EVAL_" + std::to_string(col), evals.back());
    }

    // G_col(κ^{-1})
    evals.push_back(degree_check_poly.evaluate(kappa_inv));
    transcript->send_to_verifier("DEGREE_CHECK_EVAL", evals.back());

    // -------------------------------------------------------------------------
    // Step 10: Construct the Shplonk batched quotient Q
    //
    //   Q(X) = [sum_i β_i*(C_i - c_i) + β_T*(T - t)] / (X - κ)
    //         + [β_G*(G - g)] / (X - κ^{-1})
    //
    //   or in zk
    //
    //   Q(X) = [α * (C_zk - c_zk) + sum_i β_i*(C_i - c_i) + β_T*(T - t)] / (X - κ)
    //         + [β_G*(G - g)] / (X - κ^{-1})
    // -------------------------------------------------------------------------
    Polynomial shplonk_batched_quotient = compute_shplonk_batched_quotient(
        flattened_cols, merged_table, shplonk_challenges, kappa, kappa_inv, degree_check_poly, evals);
    transcript->send_to_verifier("SHPLONK_Q", pcs_commitment_key.commit(shplonk_batched_quotient));

    // -------------------------------------------------------------------------
    // Step 11: Shplonk opening challenge z and KZG opening
    // -------------------------------------------------------------------------
    const FF z = transcript->template get_challenge<FF>("SHPLONK_OPENING_CHALLENGE");
    OpeningClaim shplonk_opening_claim = compute_shplonk_opening_claim(shplonk_batched_quotient,
                                                                       z,
                                                                       flattened_cols,
                                                                       merged_table,
                                                                       shplonk_challenges,
                                                                       kappa,
                                                                       kappa_inv,
                                                                       degree_check_poly,
                                                                       evals);

    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}

} // namespace bb
