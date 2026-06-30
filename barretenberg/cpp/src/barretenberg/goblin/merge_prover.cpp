// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "merge_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"

namespace bb {

/**
 * @brief Create MergeProver
 * @details We require an SRS at least as large as the current ultra ecc ops table
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1267): consider possible efficiency improvements
 */
MergeProver::MergeProver(const std::shared_ptr<ECCOpQueue>& op_queue, std::shared_ptr<Transcript> transcript)
    : transcript(std::move(transcript))
    , op_queue(op_queue)
{
    // MergeProver is used only for the final merge, where the hiding kernel subtable is appended at a fixed offset.
    // The verifier hard-codes the shift size from HIDING_KERNEL_ULTRA_OPS, so the prover's subtable must match.
    BB_ASSERT_EQ(op_queue->get_current_subtable_size(),
                 HIDING_KERNEL_ULTRA_OPS,
                 "Number of ultra ops in the hiding kernel doesn't match the expected value.");
    const size_t append_offset = op_queue->get_append_offset_for_prover();
    fixed_append_shift_size = ECCOpQueue::compute_fixed_append_offset(append_offset);
    op_queue->merge_fixed_append(append_offset);

    pcs_commitment_key = CommitmentKey(op_queue->get_ultra_ops_table_num_rows() + UltraEccOpsTable::ZK_ULTRA_OPS);
};

MergeProver::Polynomial MergeProver::compute_degree_check_polynomial(
    const std::array<Polynomial, NUM_WIRES>& left_table, const std::vector<FF>& degree_check_challenges) const
{
    // The left table has a fixed length, so we need to compute the reverse according to that length
    Polynomial reversed_batched_left_tables(fixed_append_shift_size);
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        reversed_batched_left_tables.add_scaled(left_table[idx], degree_check_challenges[idx]);
    }
    return reversed_batched_left_tables.reverse();
}

MergeProver::Polynomial MergeProver::compute_shplonk_batched_quotient(
    const std::array<Polynomial, NUM_WIRES>& left_table,
    const std::array<Polynomial, NUM_WIRES>& right_table,
    const std::array<Polynomial, NUM_WIRES>& merged_table,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    const Polynomial& reversed_batched_left_tables,
    const std::vector<FF>& evals)
{
    // Q such that Q·(X - κ)·(X - κ⁻¹) =
    //   (X - κ⁻¹)·(Σᵢ βᵢ(Lᵢ - lᵢ) + Σᵢ βᵢ(Rᵢ - rᵢ) + Σᵢ βᵢ(Mᵢ - mᵢ)) + (X - κ)·β(G - g)
    Polynomial shplonk_batched_quotient(merged_table[0].size());

    // Handle polynomials opened at κ
    for (size_t idx_table = 0; idx_table < 3; idx_table++) {
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            FF challenge = shplonk_batching_challenges[(idx_table * NUM_WIRES) + idx];
            FF eval = evals[(idx_table * NUM_WIRES) + idx];
            if (idx_table == 0) {
                // Q += Lᵢ·βᵢ
                shplonk_batched_quotient.add_scaled(left_table[idx], challenge);
            } else if (idx_table == 1) {
                // Q += Rᵢ·βᵢ
                shplonk_batched_quotient.add_scaled(right_table[idx], challenge);
            } else {
                // Q += Mᵢ·βᵢ
                shplonk_batched_quotient.add_scaled(merged_table[idx], challenge);
            }
            // Q -= eval·βᵢ
            if (!shplonk_batched_quotient.is_empty()) {
                shplonk_batched_quotient.at(0) -= challenge * eval;
            }
        }
    }
    // Q /= (X - κ)
    shplonk_batched_quotient.factor_roots(kappa);

    // Q += (G - g)/(X - κ⁻¹)·β
    Polynomial reversed_batched_left_tables_copy(reversed_batched_left_tables);
    if (!reversed_batched_left_tables_copy.is_empty()) {
        reversed_batched_left_tables_copy.at(0) -= evals.back();
    }
    reversed_batched_left_tables_copy.factor_roots(kappa_inv);
    shplonk_batched_quotient.add_scaled(reversed_batched_left_tables_copy, shplonk_batching_challenges.back());

    return shplonk_batched_quotient;
}

MergeProver::OpeningClaim MergeProver::compute_shplonk_opening_claim(
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
    // Q' (partially evaluated batched quotient) =
    //   -Q·(z - κ) + Σᵢ βᵢ(Lᵢ - lᵢ) + Σᵢ βᵢ(Rᵢ - rᵢ) + Σᵢ βᵢ(Mᵢ - mᵢ) + (z - κ)/(z - κ⁻¹)·β(G - g)
    Polynomial shplonk_partially_evaluated_batched_quotient(std::move(shplonk_batched_quotient));
    shplonk_partially_evaluated_batched_quotient *= -(shplonk_opening_challenge - kappa);

    // Handle polynomials opened at κ
    for (size_t idx_table = 0; idx_table < 3; idx_table++) {
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            FF challenge = shplonk_batching_challenges[(idx_table * NUM_WIRES) + idx];
            FF eval = evals[(idx_table * NUM_WIRES) + idx];
            if (idx_table == 0) {
                // Q' += Lᵢ·βᵢ
                shplonk_partially_evaluated_batched_quotient.add_scaled(left_table[idx], challenge);
            } else if (idx_table == 1) {
                // Q' += Rᵢ·βᵢ
                shplonk_partially_evaluated_batched_quotient.add_scaled(right_table[idx], challenge);
            } else {
                // Q' += Mᵢ·βᵢ
                shplonk_partially_evaluated_batched_quotient.add_scaled(merged_table[idx], challenge);
            }
            // Q' -= eval·βᵢ
            if (!shplonk_partially_evaluated_batched_quotient.is_empty()) {
                shplonk_partially_evaluated_batched_quotient.at(0) -= challenge * eval;
            }
        }
    }

    // Q' += (G - g)·(z - κ)/(z - κ⁻¹)·β
    if (!reversed_batched_left_tables.is_empty()) {
        reversed_batched_left_tables.at(0) -= evals.back();
    }
    shplonk_partially_evaluated_batched_quotient.add_scaled(reversed_batched_left_tables,
                                                            shplonk_batching_challenges.back() *
                                                                (shplonk_opening_challenge - kappa) *
                                                                (shplonk_opening_challenge - kappa_inv).invert());

    OpeningClaim shplonk_opening_claim = { .polynomial = std::move(shplonk_partially_evaluated_batched_quotient),
                                           .opening_pair = { shplonk_opening_challenge, FF(0) } };

    return shplonk_opening_claim;
}

/**
 * @brief Prove proper construction of the aggregate Goblin ECC op queue polynomials T_j.
 * @details Proves that M_j(X) = L_j(X) + X^k * R_j(X) and deg(L_j) < k for j = 1,2,3,4.
 * Uses degree-check polynomial G(X) and Shplonk for batched openings.
 *
 * L = aggregate table up to and including the tail subtable (T_tail), R = the hiding kernel's subtable (t,
 * appended at a fixed offset and carrying APPEND_TRACE_OFFSET leading zeros), M = the resulting full table (T).
 *
 * @see MERGE_PROTOCOL.md for complete protocol specification.
 * @return MergeProver::MergeProof
 */
MergeProver::MergeProof MergeProver::construct_proof()
{
    BB_BENCH_NAME("MergeProver::construct_proof");
    std::array<Polynomial, NUM_WIRES> left_table;
    std::array<Polynomial, NUM_WIRES> right_table;
    std::array<Polynomial, NUM_WIRES> merged_table = op_queue->construct_ultra_ops_table_columns(); // T

    left_table = op_queue->construct_table_columns_up_to_tail();            // T_tail
    right_table = op_queue->construct_current_ultra_ops_subtable_columns(); // t (fixed append carries
                                                                            // APPEND_TRACE_OFFSET leading zeros)

    // Compute commitments [M_j] and send to the verifier
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        transcript->send_to_verifier("MERGED_TABLE_" + std::to_string(idx),
                                     pcs_commitment_key.commit(merged_table[idx]));
    }

    // Generate degree check batching challenges, batch polynomials, compute reversed polynomial, send commitment to the
    // verifier
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(labels_degree_check);
    Polynomial reversed_batched_left_tables = compute_degree_check_polynomial(left_table, degree_check_challenges);
    transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES",
                                 pcs_commitment_key.commit(reversed_batched_left_tables));

    // Compute evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF kappa_inv = kappa.invert();

    // Send evaluations of [Lᵢ], [Rᵢ], [Mᵢ] at κ
    std::vector<FF> evals;
    evals.reserve((3 * NUM_WIRES) + 1);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(left_table[idx].evaluate(kappa));
        transcript->send_to_verifier("LEFT_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(right_table[idx].evaluate(kappa));
        transcript->send_to_verifier("RIGHT_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(merged_table[idx].evaluate(kappa));
        transcript->send_to_verifier("MERGED_TABLE_EVAL_" + std::to_string(idx), evals.back());
    }

    // Send evaluation of G at 1/κ
    evals.emplace_back(reversed_batched_left_tables.evaluate(kappa_inv));
    transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES_EVAL", evals.back());

    // Compute batching challenges
    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_short_challenges<FF>(labels_shplonk_batching_challenges);

    // Compute Shplonk batched quotient
    Polynomial shplonk_batched_quotient = compute_shplonk_batched_quotient(left_table,
                                                                           right_table,
                                                                           merged_table,
                                                                           shplonk_batching_challenges,
                                                                           kappa,
                                                                           kappa_inv,
                                                                           reversed_batched_left_tables,
                                                                           evals);

    transcript->send_to_verifier("SHPLONK_BATCHED_QUOTIENT", pcs_commitment_key.commit(shplonk_batched_quotient));

    // Generate Shplonk opening challenge
    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("shplonk_opening_challenge");

    // Compute Shplonk opening claim
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

    // KZG prover
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);

    return transcript->export_proof();
}
} // namespace bb
