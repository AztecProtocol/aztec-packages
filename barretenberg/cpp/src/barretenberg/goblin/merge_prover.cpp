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
typename std::array<typename MergeProver<BATCH_SIZE>::Polynomial, BATCH_SIZE> MergeProver<
    BATCH_SIZE>::compute_degree_check_polynomial(const PolynomialBatch& left_columns,
                                                 const std::vector<FF>& degree_check_challenges)
{
    // Zero initialization
    std::array<Polynomial, BATCH_SIZE> reversed_batched_left_columns;
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
typename MergeProver<BATCH_SIZE>::Polynomial MergeProver<BATCH_SIZE>::compute_shplonk_batched_quotient(
    const PolynomialBatch& left_columns,
    const PolynomialBatch& right_columns,
    const PolynomialBatch& merged_columns,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    const std::array<Polynomial, BATCH_SIZE>& reversed_batched_left_columns,
    const std::vector<FF>& evals)
{
    // Q such that Q·(X - κ)·(X - κ⁻¹) =
    //   (X - κ⁻¹)·(Σᵢ βᵢ(Lᵢ - lᵢ) + Σᵢ βᵢ(Rᵢ - rᵢ) + Σᵢ βᵢ(Mᵢ - mᵢ)) + (X - κ)·β(G - g)
    std::array<Polynomial, BATCH_SIZE> shplonk_batched_quotient;
    for (auto& poly : shplonk_batched_quotient) {
        poly = Polynomial(merged_columns[0][0].size());
    }

    // Handle polynomials opened at κ
    // We iterate over the batch size, and for each index we go across all the columns (left, right, merged) and take
    // the polynomial with the corresponding batch index
    for (size_t idx_table = 0; idx_table < 3; idx_table++) {
        for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
            FF challenge = shplonk_batching_challenges[(idx_table * NUM_COLUMNS) + idx];
            FF eval = evals[(idx_table * NUM_COLUMNS) + idx];
            for (size_t batch_idx = 0; batch_idx < BATCH_SIZE; batch_idx++) {
                if (idx_table == 0) {
                    // Q += Lᵢ·βᵢ
                    shplonk_batched_quotient[batch_idx].add_scaled(left_columns[idx][batch_idx], challenge);
                } else if (idx_table == 1) {
                    // Q += Rᵢ·βᵢ
                    shplonk_batched_quotient[batch_idx].add_scaled(right_columns[idx][batch_idx], challenge);
                } else {
                    // Q += Mᵢ·βᵢ
                    shplonk_batched_quotient[batch_idx].add_scaled(merged_columns[idx][batch_idx], challenge);
                }
            }
            // Q -= eval·βᵢ
            shplonk_batched_quotient[0].at(0) -= challenge * eval;
        }
    }

    // Interleave the polys
    Polynomial shplonk_batched_quotient_interleaved = interleave_polynomials(shplonk_batched_quotient);
    // Q /= (X - κ)
    shplonk_batched_quotient_interleaved.factor_roots(kappa);

    // Interleave inverse polys
    Polynomial reversed_batched_left_tables_interleaved = interleave_polynomials(reversed_batched_left_columns);
    // Q += (G - g)/(X - κ⁻¹)·β
    reversed_batched_left_tables_interleaved.at(0) -= evals.back();
    reversed_batched_left_tables_interleaved.factor_roots(kappa_inv);
    shplonk_batched_quotient_interleaved.add_scaled(reversed_batched_left_tables_interleaved,
                                                    shplonk_batching_challenges.back());

    return shplonk_batched_quotient_interleaved;
}

template <size_t BATCH_SIZE>
typename MergeProver<BATCH_SIZE>::OpeningClaim MergeProver<BATCH_SIZE>::compute_shplonk_opening_claim(
    Polynomial& shplonk_batched_quotient,
    const FF& shplonk_opening_challenge,
    const PolynomialBatch& left_columns,
    const PolynomialBatch& right_columns,
    const PolynomialBatch& merged_columns,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    std::array<Polynomial, BATCH_SIZE>& reversed_batched_left_columns,
    const std::vector<FF>& evals)
{
    // Q' (partially evaluated batched quotient) =
    //   -Q·(z - κ) + Σᵢ βᵢ(Lᵢ - lᵢ) + Σᵢ βᵢ(Rᵢ - rᵢ) + Σᵢ βᵢ(Mᵢ - mᵢ) + (z - κ)/(z - κ⁻¹)·β(G - g)

    // Rescale Q
    shplonk_batched_quotient *= -(shplonk_opening_challenge - kappa);

    // Zero initialise batches
    std::array<Polynomial, BATCH_SIZE> shplonk_partially_evaluated_batched_quotient;
    for (auto& poly : shplonk_partially_evaluated_batched_quotient) {
        poly = Polynomial(merged_columns[0][0].size());
    }

    // Handle polynomials opened at κ
    // We iterate over the batch size, and for each index we go across all the columns (left, right, merged) and take
    // the polynomial with the corresponding batch index
    for (size_t idx_table = 0; idx_table < 3; idx_table++) {
        for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
            FF challenge = shplonk_batching_challenges[(idx_table * NUM_COLUMNS) + idx];
            FF eval = evals[(idx_table * NUM_COLUMNS) + idx];
            for (size_t batch_idx = 0; batch_idx < BATCH_SIZE; batch_idx++) {
                if (idx_table == 0) {
                    // Q' += Lᵢ·βᵢ
                    shplonk_partially_evaluated_batched_quotient[batch_idx].add_scaled(left_columns[idx][batch_idx],
                                                                                       challenge);
                } else if (idx_table == 1) {
                    // Q' += Rᵢ·βᵢ
                    shplonk_partially_evaluated_batched_quotient[batch_idx].add_scaled(right_columns[idx][batch_idx],
                                                                                       challenge);
                } else {
                    // Q' += Mᵢ·βᵢ
                    shplonk_partially_evaluated_batched_quotient[batch_idx].add_scaled(merged_columns[idx][batch_idx],
                                                                                       challenge);
                }
            }
            // Q' -= eval·βᵢ
            shplonk_partially_evaluated_batched_quotient[0].at(0) -= challenge * eval;
        }
    }

    Polynomial shplonk_partially_evaluated_batched_quotient_interlaved =
        interleave_polynomials(shplonk_partially_evaluated_batched_quotient);

    // Q' += (G - g)·(z - κ)/(z - κ⁻¹)·β
    Polynomial reversed_batched_left_columns_interleaved = interleave_polynomials(reversed_batched_left_columns);
    reversed_batched_left_columns_interleaved.at(0) -= evals.back();
    shplonk_partially_evaluated_batched_quotient_interlaved.add_scaled(
        reversed_batched_left_columns_interleaved,
        shplonk_batching_challenges.back() * (shplonk_opening_challenge - kappa) *
            (shplonk_opening_challenge - kappa_inv).invert());

    // Interleave the polys
    shplonk_batched_quotient += shplonk_partially_evaluated_batched_quotient_interlaved;

    OpeningClaim shplonk_opening_claim = { .polynomial = std::move(shplonk_batched_quotient),
                                           .opening_pair = { shplonk_opening_challenge, FF(0) } };

    return shplonk_opening_claim;
}

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
template <size_t BATCH_SIZE> typename MergeProver<BATCH_SIZE>::MergeProof MergeProver<BATCH_SIZE>::construct_proof()
{
    std::array<Polynomial, NUM_WIRES> left_table;
    std::array<Polynomial, NUM_WIRES> right_table;
    std::array<Polynomial, NUM_WIRES> merged_table = op_queue->construct_ultra_ops_table_columns(); // T
    std::array<Polynomial, NUM_WIRES> left_table_reversed;

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
    std::array<Polynomial, BATCH_SIZE> reversed_batched_left_columns =
        compute_degree_check_polynomial(left_columns, degree_check_challenges);
    transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES",
                                 pcs_commitment_key.commit_interleaved<BATCH_SIZE>(reversed_batched_left_columns));

    // Compute batching challenges
    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_challenges<FF>(labels_shplonk_batching_challenges());

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
    std::vector<FF> evals;
    evals.reserve((3 * NUM_COLUMNS) + 1);
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        FF eval = 0;
        for (size_t idx_batch = 0; idx_batch < BATCH_SIZE; idx_batch++) {
            eval += left_columns[idx][idx_batch].evaluate(powers_of_kappa.back()) * powers_of_kappa[idx_batch];
        }
        evals.emplace_back(eval);
        transcript->send_to_verifier("LEFT_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        FF eval = 0;
        for (size_t idx_batch = 0; idx_batch < BATCH_SIZE; idx_batch++) {
            eval += right_columns[idx][idx_batch].evaluate(powers_of_kappa.back()) * powers_of_kappa[idx_batch];
        }
        evals.emplace_back(eval);
        transcript->send_to_verifier("RIGHT_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        FF eval = 0;
        for (size_t idx_batch = 0; idx_batch < BATCH_SIZE; idx_batch++) {
            eval += merged_columns[idx][idx_batch].evaluate(powers_of_kappa.back()) * powers_of_kappa[idx_batch];
        }
        evals.emplace_back(eval);
        transcript->send_to_verifier("MERGED_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }

    // Send evaluation of G at 1/κ
    FF eval = 0;
    for (size_t idx_batch = 0; idx_batch < BATCH_SIZE; idx_batch++) {
        eval += reversed_batched_left_columns[idx_batch].evaluate(powers_of_kappa_inv.back()) *
                powers_of_kappa_inv[idx_batch];
    }
    evals.emplace_back(eval);
    transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES_EVAL", evals.back());

    // Compute Shplonk batched quotient
    Polynomial shplonk_batched_quotient = compute_shplonk_batched_quotient(left_columns,
                                                                           right_columns,
                                                                           merged_columns,
                                                                           shplonk_batching_challenges,
                                                                           kappa,
                                                                           kappa_inv,
                                                                           reversed_batched_left_columns,
                                                                           evals);

    transcript->send_to_verifier("SHPLONK_BATCHED_QUOTIENT", pcs_commitment_key.commit(shplonk_batched_quotient));

    // Generate Shplonk opening challenge
    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("shplonk_opening_challenge");

    // Compute Shplonk opening claim
    OpeningClaim shplonk_opening_claim = compute_shplonk_opening_claim(shplonk_batched_quotient,
                                                                       shplonk_opening_challenge,
                                                                       left_columns,
                                                                       right_columns,
                                                                       merged_columns,
                                                                       shplonk_batching_challenges,
                                                                       kappa,
                                                                       kappa_inv,
                                                                       reversed_batched_left_columns,
                                                                       evals);

    // KZG prover
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}

template <size_t BATCH_SIZE>
typename MergeProver<BATCH_SIZE>::MergeProof MergeProver<BATCH_SIZE>::construct_de_interleaving_proof()
{
    std::array<Polynomial, NUM_WIRES> merged_table = op_queue->construct_ultra_ops_table_columns();

    // Construct interleaved merged columns
    PolynomialBatch merged_columns(merged_table);
    std::array<Polynomial, NUM_COLUMNS> merged_columns_interleaved;
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        merged_columns_interleaved[idx] = interleave_polynomials(merged_columns[idx]);
    }

    // Send commitment to the de-interleaved merged columns to the verifier
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        transcript->send_to_verifier("MERGED_TABLE_" + std::to_string(idx),
                                     pcs_commitment_key.commit(merged_table[idx]));
    }

    // Compute evaluation challenge
    FF evaluation_challenge = transcript->template get_challenge<FF>("evaluation_challenge");

    // Prepare opening claims
    std::vector<OpeningClaim> opening_claims;
    opening_claims.reserve(NUM_WIRES + NUM_COLUMNS);
    for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
        FF eval = merged_columns_interleaved[idx].evaluate(evaluation_challenge);
        opening_claims.emplace_back(OpeningClaim{ merged_columns_interleaved[idx], { evaluation_challenge, eval } });
    }
    // Send evaluations of the de-interleaved merged columns
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF eval = merged_table[idx].evaluate(evaluation_challenge);
        opening_claims.emplace_back(OpeningClaim{ merged_table[idx], { evaluation_challenge, eval } });
        transcript->send_to_verifier("MERGED_TABLE_EVAL_" + std::to_string(idx), eval);
    }

    // Shplonk prover
    OpeningClaim shplonk_opening_claim = ShplonkProver_<Curve>::prove(pcs_commitment_key, opening_claims, transcript);

    // KZG prover
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}

template class MergeProver<1>;
template class MergeProver<2>;
template class MergeProver<4>;
} // namespace bb
