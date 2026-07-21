// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "batch_merge_prover.hpp"

#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include <algorithm>

namespace bb {

BatchMergeProver::BatchMergeProver(const std::shared_ptr<ECCOpQueue>& op_queue, size_t max_subtables)
    : transcript(std::make_shared<Transcript>())
    , op_queue(op_queue)
    , max_subtables(max_subtables)
{
    // The commitment key must be large enough for the full merged table (plus the zk offset).
    pcs_commitment_key = CommitmentKey(op_queue->get_ultra_ops_table_num_rows() + UltraEccOpsTable::ZK_ULTRA_OPS);
}

typename BatchMergeProver::Polynomial BatchMergeProver::compute_degree_check_polynomial(
    const std::vector<Polynomial>& flattened_columns,
    const std::vector<FF>& degree_check_challenges,
    const size_t max_size)
{
    // Zero initialization
    Polynomial reversed_batched_poly(max_size);
    std::vector<Polynomial> reversed_columns;
    reversed_columns.reserve(flattened_columns.size());
    for (const auto& poly : flattened_columns) {
        reversed_columns.emplace_back(poly.reverse());
    }

    std::vector<PolynomialSpan<const FF>> reversed_column_spans;
    std::vector<FF> scalars;
    reversed_column_spans.reserve(flattened_columns.size());
    scalars.reserve(flattened_columns.size());
    for (size_t idx = 0; idx < flattened_columns.size(); ++idx) {
        reversed_column_spans.emplace_back(reversed_columns[idx]);
        scalars.push_back(degree_check_challenges[idx]);
    }

    add_scaled_batch(reversed_batched_poly,
                     std::span<const PolynomialSpan<const FF>>(reversed_column_spans),
                     std::span<const FF>(scalars));

    return reversed_batched_poly;
}

typename BatchMergeProver::MergeProof BatchMergeProver::construct_proof()
{
    BB_BENCH_NAME("BatchMergeProver::construct_proof");
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
        [[maybe_unused]] FF _ = transcript->template get_challenge<FF>("HASH_" + std::to_string(idx));
    }

    Commitment infinity = Commitment::infinity();
    for (size_t idx = N; idx < M; ++idx) {
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            transcript->send_to_verifier("COLUMN_" + std::to_string(col) + "_" + std::to_string(idx), infinity);
        }
        // update hash after each subtable to match verifier's transcript
        [[maybe_unused]] FF _ = transcript->template get_challenge<FF>("HASH_" + std::to_string(idx));
    }

    // -------------------------------------------------------------------------
    // Step 2.b: Send the masking table
    // -------------------------------------------------------------------------
    std::array<Polynomial, NUM_WIRES> zk_columns = op_queue->construct_zk_columns();
    for (size_t col = 0; col < NUM_WIRES; ++col) {
        transcript->send_to_verifier("ZK_COLUMN_" + std::to_string(col), pcs_commitment_key.commit(zk_columns[col]));
    }
    max_shift_size = std::max(max_shift_size, zk_columns[0].size());

    // -------------------------------------------------------------------------
    // Step 2.c: Flatten the columns for easier utilization
    // -------------------------------------------------------------------------
    std::vector<Polynomial> flattened_cols;
    flattened_cols.reserve((subtable_cols.size() * NUM_WIRES) + NUM_WIRES);
    for (size_t col = 0; col < NUM_WIRES; ++col) {
        flattened_cols.push_back(std::move(zk_columns[col]));
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
    std::array<Polynomial, NUM_WIRES> merged_table(op_queue->construct_ultra_ops_table_columns());
    for (size_t col = 0; col < NUM_WIRES; ++col) {
        transcript->send_to_verifier("MERGED_COLUMN_" + std::to_string(col),
                                     pcs_commitment_key.commit(merged_table[col]));
    }

    // -------------------------------------------------------------------------
    // Step 5: Compute degree check batching challenges 1, α, α^2, .., α^{(M + 1) * NUM_WIRES -1}
    // -------------------------------------------------------------------------
    const FF degree_check_challenge = transcript->template get_challenge<FF>("DEGREE_CHECK_CHALLENGE");
    const size_t num_degree_check_challenges = (M + 1) * NUM_WIRES;
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
    // Step 7: Evaluation challenge κ
    // -------------------------------------------------------------------------
    const FF kappa = transcript->template get_challenge<FF>("KAPPA");
    const FF kappa_inv = kappa.invert();

    // -------------------------------------------------------------------------
    // Step 8: Compute and send evaluations C_i(κ), T(κ), G(κ^{-1})
    // -------------------------------------------------------------------------
    // C_i_col(κ)
    std::vector<FF> evals;
    const size_t num_actual_flattened_cols = (N * NUM_WIRES) + NUM_WIRES;
    const size_t num_flattened_col_evals = (M * NUM_WIRES) + NUM_WIRES;
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
    // Step 9: Shplonk to open
    //   zk columns
    //   for C_i(κ)
    //   T(κ)
    //   for G(κ^{-1})
    // -------------------------------------------------------------------------
    const size_t num_opening_claims = ((M + 2) * NUM_WIRES) + 1;
    std::vector<OpeningClaim> opening_claims;
    opening_claims.reserve(num_opening_claims);
    for (size_t idx = 0; idx < num_flattened_col_evals; ++idx) {
        if (idx >= num_actual_flattened_cols || flattened_cols[idx].size() == 0) {
            // We use Polynomial(1) to avoid failures in Shplonk due to accessing empty polynomials
            opening_claims.push_back({ Polynomial(1), { kappa, FF(0) } });
        } else {
            opening_claims.push_back({ std::move(flattened_cols[idx]), { kappa, evals[idx] } });
        }
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        opening_claims.push_back({ std::move(merged_table[idx]), { kappa, evals[((M + 1) * NUM_WIRES) + idx] } });
    }
    opening_claims.push_back({ std::move(degree_check_poly), { kappa_inv, evals.back() } });

    auto shplonk_opening_claim = ShplonkProver::prove(pcs_commitment_key, opening_claims, transcript);

    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}

} // namespace bb
