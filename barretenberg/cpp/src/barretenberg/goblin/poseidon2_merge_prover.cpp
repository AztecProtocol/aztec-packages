#include "poseidon2_merge_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"

namespace bb {

/**
 * @brief Create Poseidon2MergeProver.
 * @details Merges the current Poseidon2 op subtable and initializes commitment key.
 *
 * NOTE: This implementation mirrors MergeProver::MergeProver() exactly, adapted for
 * Poseidon2OpQueue with 5 columns. In a future refactor, both could be templated on
 * the op queue type and NUM_WIRES.
 */
Poseidon2MergeProver::Poseidon2MergeProver(const std::shared_ptr<Poseidon2OpQueue>& op_queue,
                                           std::shared_ptr<Transcript> transcript,
                                           MergeSettings settings)
    : transcript(std::move(transcript))
    , op_queue(op_queue)
    , settings(settings)
{
    op_queue->merge(settings);
    pcs_commitment_key = CommitmentKey(op_queue->get_total_num_rows());
}

Poseidon2MergeProver::Polynomial Poseidon2MergeProver::compute_degree_check_polynomial(
    const std::array<Polynomial, NUM_WIRES>& left_table, const std::vector<FF>& degree_check_challenges)
{
    Polynomial reversed_batched_left_tables(left_table[0].size());
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        reversed_batched_left_tables.add_scaled(left_table[idx], degree_check_challenges[idx]);
    }
    return reversed_batched_left_tables.reverse();
}

Poseidon2MergeProver::Polynomial Poseidon2MergeProver::compute_shplonk_batched_quotient(
    const std::array<Polynomial, NUM_WIRES>& left_table,
    const std::array<Polynomial, NUM_WIRES>& right_table,
    const std::array<Polynomial, NUM_WIRES>& merged_table,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    const Polynomial& reversed_batched_left_tables,
    const std::vector<FF>& evals)
{
    Polynomial shplonk_batched_quotient(merged_table[0].size());

    for (size_t idx_table = 0; idx_table < 3; idx_table++) {
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            FF challenge = shplonk_batching_challenges[(idx_table * NUM_WIRES) + idx];
            FF eval = evals[(idx_table * NUM_WIRES) + idx];
            if (idx_table == 0) {
                shplonk_batched_quotient.add_scaled(left_table[idx], challenge);
            } else if (idx_table == 1) {
                shplonk_batched_quotient.add_scaled(right_table[idx], challenge);
            } else {
                shplonk_batched_quotient.add_scaled(merged_table[idx], challenge);
            }
            shplonk_batched_quotient.at(0) -= challenge * eval;
        }
    }
    shplonk_batched_quotient.factor_roots(kappa);

    Polynomial reversed_batched_left_tables_copy(reversed_batched_left_tables);
    reversed_batched_left_tables_copy.at(0) -= evals.back();
    reversed_batched_left_tables_copy.factor_roots(kappa_inv);
    shplonk_batched_quotient.add_scaled(reversed_batched_left_tables_copy, shplonk_batching_challenges.back());

    return shplonk_batched_quotient;
}

Poseidon2MergeProver::OpeningClaim Poseidon2MergeProver::compute_shplonk_opening_claim(
    Polynomial& shplonk_batched_quotient,
    const FF& shplonk_opening_challenge,
    const std::array<Polynomial, NUM_WIRES>& left_table,
    const std::array<Polynomial, NUM_WIRES>& right_table,
    const std::array<Polynomial, NUM_WIRES>& merged_table,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    Polynomial& reversed_batched_left_tables,
    const std::vector<FF>& evals)
{
    Polynomial shplonk_partially_evaluated_batched_quotient(std::move(shplonk_batched_quotient));
    shplonk_partially_evaluated_batched_quotient *= -(shplonk_opening_challenge - kappa);

    for (size_t idx_table = 0; idx_table < 3; idx_table++) {
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            FF challenge = shplonk_batching_challenges[(idx_table * NUM_WIRES) + idx];
            FF eval = evals[(idx_table * NUM_WIRES) + idx];
            if (idx_table == 0) {
                shplonk_partially_evaluated_batched_quotient.add_scaled(left_table[idx], challenge);
            } else if (idx_table == 1) {
                shplonk_partially_evaluated_batched_quotient.add_scaled(right_table[idx], challenge);
            } else {
                shplonk_partially_evaluated_batched_quotient.add_scaled(merged_table[idx], challenge);
            }
            shplonk_partially_evaluated_batched_quotient.at(0) -= challenge * eval;
        }
    }

    reversed_batched_left_tables.at(0) -= evals.back();
    shplonk_partially_evaluated_batched_quotient.add_scaled(reversed_batched_left_tables,
                                                            shplonk_batching_challenges.back() *
                                                                (shplonk_opening_challenge - kappa) *
                                                                (shplonk_opening_challenge - kappa_inv).invert());

    OpeningClaim shplonk_opening_claim = { .polynomial = std::move(shplonk_partially_evaluated_batched_quotient),
                                           .opening_pair = { shplonk_opening_challenge, FF(0) } };

    return shplonk_opening_claim;
}

/**
 * @brief Prove correct concatenation of the Poseidon2 op queue subtables.
 *
 * @details Identical protocol to MergeProver::construct_proof() but with 5 wire columns
 * (matching Poseidon2OpQueue::TABLE_WIDTH) and using the Poseidon2OpQueue for table
 * construction. All transcript labels are prefixed with "P2_" to avoid collisions.
 */
Poseidon2MergeProver::MergeProof Poseidon2MergeProver::construct_proof()
{
    std::array<Polynomial, NUM_WIRES> left_table;
    std::array<Polynomial, NUM_WIRES> right_table;
    std::array<Polynomial, NUM_WIRES> merged_table = op_queue->construct_table_columns();

    if (settings == MergeSettings::PREPEND) {
        left_table = op_queue->construct_current_subtable_columns();
        right_table = op_queue->construct_previous_table_columns();
    } else {
        left_table = op_queue->construct_previous_table_columns();
        right_table = op_queue->construct_current_subtable_columns();
    }

    const size_t shift_size = left_table[0].size();
    transcript->send_to_verifier("p2_shift_size", static_cast<uint32_t>(shift_size));

    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        transcript->send_to_verifier("P2_MERGED_TABLE_" + std::to_string(idx),
                                     pcs_commitment_key.commit(merged_table[idx]));
    }

    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(labels_degree_check);
    Polynomial reversed_batched_left_tables = compute_degree_check_polynomial(left_table, degree_check_challenges);
    transcript->send_to_verifier("P2_REVERSED_BATCHED_LEFT_TABLES",
                                 pcs_commitment_key.commit(reversed_batched_left_tables));

    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_challenges<FF>(labels_shplonk_batching_challenges);

    const FF kappa = transcript->template get_challenge<FF>("p2_kappa");
    const FF kappa_inv = kappa.invert();

    std::vector<FF> evals;
    evals.reserve((3 * NUM_WIRES) + 1);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(left_table[idx].evaluate(kappa));
        transcript->send_to_verifier("P2_LEFT_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(right_table[idx].evaluate(kappa));
        transcript->send_to_verifier("P2_RIGHT_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(merged_table[idx].evaluate(kappa));
        transcript->send_to_verifier("P2_MERGED_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }
    evals.emplace_back(reversed_batched_left_tables.evaluate(kappa_inv));
    transcript->send_to_verifier("P2_REVERSED_BATCHED_LEFT_TABLES_EVAL", evals.back());

    Polynomial shplonk_batched_quotient = compute_shplonk_batched_quotient(left_table,
                                                                           right_table,
                                                                           merged_table,
                                                                           shplonk_batching_challenges,
                                                                           kappa,
                                                                           kappa_inv,
                                                                           reversed_batched_left_tables,
                                                                           evals);

    transcript->send_to_verifier("P2_SHPLONK_BATCHED_QUOTIENT",
                                 pcs_commitment_key.commit(shplonk_batched_quotient));

    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("p2_shplonk_opening_challenge");

    OpeningClaim shplonk_opening_claim = compute_shplonk_opening_claim(shplonk_batched_quotient,
                                                                       shplonk_opening_challenge,
                                                                       left_table,
                                                                       right_table,
                                                                       merged_table,
                                                                       shplonk_batching_challenges,
                                                                       kappa,
                                                                       kappa_inv,
                                                                       reversed_batched_left_tables,
                                                                       evals);

    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}

} // namespace bb
