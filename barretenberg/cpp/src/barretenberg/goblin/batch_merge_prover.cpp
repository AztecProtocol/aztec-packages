// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "batch_merge_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"

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

/**
 * @brief Interleave BATCH_SIZE polynomials of the same size into one polynomial of size k * BATCH_SIZE.
 * @details The interleaved poly satisfies interleaved[i * BATCH_SIZE + b] = polys[b][i].
 */
template <size_t BATCH_SIZE>
typename BatchMergeProver<BATCH_SIZE>::Polynomial BatchMergeProver<BATCH_SIZE>::interleave_batch(const Batch& batch)
{
    const size_t k = batch[0].size();
    Polynomial interleaved(k * BATCH_SIZE);
    for (size_t i = 0; i < k; ++i) {
        for (size_t b = 0; b < BATCH_SIZE; ++b) {
            interleaved.at(i * BATCH_SIZE + b) = batch[b].at(i);
        }
    }
    return interleaved;
}

/**
 * @brief Compute the reversed batch for the degree check.
 * @details Returns α * reversed_at_{k_max}(C_i): the BATCH_SIZE-element batch whose interleaved
 * form equals X^{k_max*BATCH_SIZE - 1} * C_i_interleaved(1/X). This is used to prove deg(C_i) < k_max.
 *
 * The reversal of an interleaved polynomial obeys a specific index permutation:
 *   reversed[j * BATCH_SIZE + b] = C[k-1-j, BATCH_SIZE-1-b]
 * where C[j, b] = C_i_interleaved[j * BATCH_SIZE + b] = poly_b[j].
 *
 * So reversed_batch[BATCH_SIZE - 1 - b][k_max - 1 - j] = poly_b[j].
 */
template <size_t BATCH_SIZE>
typename BatchMergeProver<BATCH_SIZE>::Batch BatchMergeProver<BATCH_SIZE>::compute_reversed_batch(const Batch& batch,
                                                                                                  size_t k_max)
{
    Batch reversed;
    for (auto& p : reversed) {
        p = Polynomial(k_max);
    }
    for (size_t b = 0; b < BATCH_SIZE; ++b) {
        const auto& poly = batch[b];
        const size_t k = poly.size();
        for (size_t i = 0; i < k; ++i) {
            reversed[BATCH_SIZE - 1 - b].at(k_max - 1 - i) += poly.at(i);
        }
    }
    return reversed;
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
    const size_t N = op_queue->get_num_subtables(); // actual number of subtables
    const size_t M = max_subtables;
    BB_ASSERT_LTE(N, M, "BatchMergeProver: more subtables than max_subtables");

    // -------------------------------------------------------------------------
    // Step 1: Gather subtable column polynomials and their shift sizes
    // -------------------------------------------------------------------------
    // subtable_cols[i] = array of NUM_WIRES polynomials for subtable i (deque order)
    std::vector<std::array<Polynomial, NUM_WIRES>> subtable_cols(N);
    std::vector<size_t> shift_sizes(N);
    for (size_t i = 0; i < N; ++i) {
        subtable_cols[i] = op_queue->construct_individual_subtable_columns(i);
        shift_sizes[i] = subtable_cols[i][0].size(); // number of rows per poly (before interleaving)
    }
    size_t k_max = *std::max_element(shift_sizes.begin(), shift_sizes.end());

    // Send N and shift sizes to the verifier
    transcript->send_to_verifier("batch_merge_num_subtables", static_cast<uint32_t>(N));
    for (size_t i = 0; i < N; ++i) {
        transcript->send_to_verifier("batch_merge_shift_size_" + std::to_string(i),
                                     static_cast<uint32_t>(shift_sizes[i]));
    }

    // -------------------------------------------------------------------------
    // Step 2: Construct and commit to T (full merged table)
    // -------------------------------------------------------------------------
    std::array<Polynomial, NUM_WIRES> merged_table = op_queue->construct_ultra_ops_table_columns();
    const size_t merged_size = merged_table[0].size(); // number of rows in T per wire

    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        Batch T_batch;
        for (size_t b = 0; b < BATCH_SIZE; ++b) {
            T_batch[b] = merged_table[col * BATCH_SIZE + b];
        }
        transcript->send_to_verifier("BATCH_MERGED_TABLE_" + std::to_string(col),
                                     pcs_commitment_key.commit_interleaved<BATCH_SIZE>(T_batch));
    }

    // -------------------------------------------------------------------------
    // Step 3: Receive degree check batching challenges α_0..α_{M-1}
    // -------------------------------------------------------------------------
    std::vector<std::string> alpha_labels;
    alpha_labels.reserve(M);
    for (size_t i = 0; i < M; ++i) {
        alpha_labels.emplace_back("BATCH_MERGE_DEGREE_CHECK_" + std::to_string(i));
    }
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(alpha_labels);

    // -------------------------------------------------------------------------
    // Step 4: Compute G = sum_i α_i * reversed_at_{k_max}(C_i), commit, send [G]
    // -------------------------------------------------------------------------
    // G is stored as one Batch per column (size k_max per wire = k_max * BATCH_SIZE interleaved)
    std::vector<Batch> G_batches(NUM_COLUMNS);
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        for (auto& p : G_batches[col]) {
            p = Polynomial(k_max);
        }
        for (size_t i = 0; i < N; ++i) {
            Batch C_batch;
            for (size_t b = 0; b < BATCH_SIZE; ++b) {
                C_batch[b] = subtable_cols[i][col * BATCH_SIZE + b];
            }
            Batch rev = compute_reversed_batch(C_batch, k_max);
            for (size_t b = 0; b < BATCH_SIZE; ++b) {
                G_batches[col][b].add_scaled(rev[b], degree_check_challenges[i]);
            }
        }
        transcript->send_to_verifier("BATCH_MERGE_G_" + std::to_string(col),
                                     pcs_commitment_key.commit_interleaved<BATCH_SIZE>(G_batches[col]));
    }

    // -------------------------------------------------------------------------
    // Step 5: Receive Shplonk batching challenges
    //   β_0..β_{N-1}: for C_i(κ) (one per subtable per column = N * NUM_COLUMNS)
    //   β_N: for T(κ)  (one per column = NUM_COLUMNS)
    //   β_{N+1}: for G(κ^{-1}) (one per column = NUM_COLUMNS)
    // We use a flat list of (N + 2) * NUM_COLUMNS challenges.
    // -------------------------------------------------------------------------
    const size_t num_shplonk_challenges = (N + 2) * NUM_COLUMNS;
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

    // Helper: evaluate a Batch at a point using the powers_of_challenge vector
    auto eval_batch = [&](const Batch& batch, const std::vector<FF>& powers) -> FF {
        // batch.evaluate uses powers.back() as the base and powers[0..BATCH_SIZE-1] as limb scalars
        FF result(0);
        const FF base = powers.back(); // κ^BATCH_SIZE or κ^{-BATCH_SIZE}
        for (size_t b = 0; b < BATCH_SIZE; ++b) {
            result += batch[b].evaluate(base) * powers[b];
        }
        return result;
    };

    // -------------------------------------------------------------------------
    // Step 7: Compute and send evaluations C_i(κ), T(κ), G(κ^{-1})
    // -------------------------------------------------------------------------
    // c_evals[i][col] = C_i_col(κ)
    std::vector<std::vector<FF>> c_evals(N, std::vector<FF>(NUM_COLUMNS));
    for (size_t i = 0; i < N; ++i) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            Batch C_batch;
            for (size_t b = 0; b < BATCH_SIZE; ++b) {
                C_batch[b] = subtable_cols[i][col * BATCH_SIZE + b];
            }
            c_evals[i][col] = eval_batch(C_batch, powers_of_kappa);
            transcript->send_to_verifier("BATCH_MERGE_C_EVAL_" + std::to_string(i) + "_" + std::to_string(col),
                                         c_evals[i][col]);
        }
    }

    // t_evals[col] = T_col(κ)
    std::vector<FF> t_evals(NUM_COLUMNS);
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        Batch T_batch;
        for (size_t b = 0; b < BATCH_SIZE; ++b) {
            T_batch[b] = merged_table[col * BATCH_SIZE + b];
        }
        t_evals[col] = eval_batch(T_batch, powers_of_kappa);
        transcript->send_to_verifier("BATCH_MERGE_T_EVAL_" + std::to_string(col), t_evals[col]);
    }

    // g_evals[col] = G_col(κ^{-1})
    std::vector<FF> g_evals(NUM_COLUMNS);
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        g_evals[col] = eval_batch(G_batches[col], powers_of_kappa_inv);
        transcript->send_to_verifier("BATCH_MERGE_G_EVAL_" + std::to_string(col), g_evals[col]);
    }

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
    const size_t q_size = BATCH_SIZE * std::max(merged_size, k_max);
    Polynomial shplonk_batched_quotient(q_size);

    // For the interleaved batched polynomial at κ: sum contributions from all C_i and T
    // interleaved_at_kappa(X) = sum_{col} sum_i β_{i*NUM_COLUMNS+col} * (C_i_il[col](X) - c_i[col])
    //                           + sum_{col} β_{N*NUM_COLUMNS+col} * (T_il[col](X) - t[col])
    Polynomial interleaved_at_kappa(BATCH_SIZE * merged_size);
    {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            for (size_t i = 0; i < N; ++i) {
                Batch C_batch;
                for (size_t b = 0; b < BATCH_SIZE; ++b) {
                    C_batch[b] = subtable_cols[i][col * BATCH_SIZE + b];
                }
                const FF beta = betas[i * NUM_COLUMNS + col];
                // Interleave C_i_col (padded to merged_size rows in the interleaved poly)
                Polynomial C_il = interleave_batch(C_batch); // size k_i * BATCH_SIZE
                interleaved_at_kappa.add_scaled(C_il, beta);
                interleaved_at_kappa.at(0) -= c_evals[i][col] * beta;
            }
            // T column
            {
                Batch T_batch;
                for (size_t b = 0; b < BATCH_SIZE; ++b) {
                    T_batch[b] = merged_table[col * BATCH_SIZE + b];
                }
                const FF beta_T = betas[N * NUM_COLUMNS + col];
                Polynomial T_il = interleave_batch(T_batch);
                interleaved_at_kappa.add_scaled(T_il, beta_T);
                interleaved_at_kappa.at(0) -= t_evals[col] * beta_T;
            }
        }
        Polynomial q_kappa = interleaved_at_kappa; // copy before factor_roots mutates
        q_kappa.factor_roots(kappa);
        shplonk_batched_quotient += q_kappa;
    }

    // interleaved_at_kappa_inv(X) = sum_{col} β_{(N+1)*NUM_COLUMNS+col} * (G_il[col](X) - g[col])
    Polynomial interleaved_at_kappa_inv(BATCH_SIZE * k_max);
    {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            const FF beta_G = betas[(N + 1) * NUM_COLUMNS + col];
            Polynomial G_il = interleave_batch(G_batches[col]);
            interleaved_at_kappa_inv.add_scaled(G_il, beta_G);
            interleaved_at_kappa_inv.at(0) -= g_evals[col] * beta_G;
        }
        Polynomial q_kappa_inv = interleaved_at_kappa_inv;
        q_kappa_inv.factor_roots(kappa_inv);
        shplonk_batched_quotient += q_kappa_inv;
    }

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
