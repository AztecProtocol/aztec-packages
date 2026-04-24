// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "merge_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"

namespace bb {

static_assert(MERGE_APPEND_OUTPUT_SHIFT == TranslatorFlavor::RANDOMNESS_START,
              "MERGE_APPEND_OUTPUT_SHIFT must equal TranslatorFlavor::RANDOMNESS_START: the merge protocol's output "
              "polynomial and the Translator's wire polynomials share the same commitment, so their leading-zero "
              "layout must match.");

/**
 * @brief Create MergeProver
 * @details We require an SRS at least as large as the current ultra ecc ops table
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1267): consider possible efficiency improvements
 */
MergeProver::MergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                         std::shared_ptr<Transcript> transcript,
                         MergeSettings settings)
    : transcript(std::move(transcript))
    , op_queue(op_queue)
    , settings(settings)
{
    // Merge the current subtable (for which a merge proof is being constructed) prior to
    // procedeing with proving.
    if (settings == MergeSettings::APPEND) {
        op_queue->merge(settings, op_queue->get_append_offset());

    } else {
        op_queue->merge(settings);
    }

    // Size the commitment key to accommodate the X^s shift applied to merge polynomials
    pcs_commitment_key = CommitmentKey(op_queue->get_ultra_ops_table_num_rows() + FULL_SHIFT);
};

MergeProver::Polynomial MergeProver::compute_degree_check_polynomial(
    const std::array<Polynomial, NUM_WIRES>& left_table,
    const std::vector<FF>& degree_check_challenges,
    size_t shift_size)
{
    // Reverse only the data portion of L (positions FULL_SHIFT..FULL_SHIFT+shift_size-1).
    // G has size shift_size, giving a tight degree bound deg(L_data) < shift_size via Thakur's check.
    // The zero prefix of L is enforced separately by the PCS: the verifier opens [L'] = [X^s·L_data]
    // against κ^s·l_data, which fails if L' has non-zero coefficients in positions 0..s-1.
    Polynomial batched_data(shift_size);
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        for (size_t j = 0; j < shift_size; j++) {
            batched_data.at(j) += degree_check_challenges[idx] * left_table[idx][FULL_SHIFT + j];
        }
    }
    return batched_data.reverse();
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
    // Quotient must fit the largest polynomial (L/R are shifted, M is not; take the max)
    const size_t quotient_size = std::max({ left_table[0].size(), right_table[0].size(), merged_table[0].size() });
    Polynomial shplonk_batched_quotient(quotient_size);

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
 * For PREPEND: L = subtable (t), R = previous table (T_prev)
 * For APPEND:  L = previous table (T_prev), R = subtable (t)
 *
 * @see MERGE_PROTOCOL.md for complete protocol specification.
 * @return MergeProver::MergeProof
 */
MergeProver::MergeProof MergeProver::construct_proof()
{
    BB_BENCH_NAME("MergeProver::construct_proof");

    // Construct L and R with FULL_SHIFT leading zeros to match the circuit's ecc_op_wire layout.
    // Derive M from the full merged table with the appropriate shift for Translator/chain propagation.
    const size_t m_shift = (settings == MergeSettings::PREPEND) ? FULL_SHIFT : APPEND_OUTPUT_SHIFT;

    Table left_table = (settings == MergeSettings::PREPEND)
                           ? op_queue->construct_current_ultra_ops_subtable_columns(FULL_SHIFT)
                           : op_queue->construct_previous_ultra_ops_table_columns(FULL_SHIFT);
    Table right_table = (settings == MergeSettings::PREPEND)
                            ? op_queue->construct_previous_ultra_ops_table_columns(FULL_SHIFT)
                            : op_queue->construct_current_ultra_ops_subtable_columns(FULL_SHIFT);
    Table merged_table = op_queue->construct_ultra_ops_table_columns(m_shift);

    // shift_size is the unshifted L size (strip the leading zeros)
    const size_t shift_size = left_table[0].size() - FULL_SHIFT;

    transcript->send_to_verifier("shift_size", static_cast<uint32_t>(shift_size));

    // Compute commitments [M_j] and send to the verifier
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        transcript->send_to_verifier("MERGED_TABLE_" + std::to_string(idx),
                                     pcs_commitment_key.commit(merged_table[idx]));
    }

    // Generate degree check batching challenges, compute reversed polynomial from L_data only (tight degree bound)
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(labels_degree_check);
    Polynomial reversed_batched_left_tables =
        compute_degree_check_polynomial(left_table, degree_check_challenges, shift_size);
    transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES",
                                 pcs_commitment_key.commit(reversed_batched_left_tables));

    // Compute batching challenges
    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_challenges<FF>(labels_shplonk_batching_challenges);

    // Compute evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF kappa_inv = kappa.invert();
    const FF kappa_to_s = kappa.pow(FULL_SHIFT);

    // Send L_data evaluations (unshifted) to the transcript. The verifier reconstructs the shifted
    // evaluations as κ^s · l_data for the concatenation check and PCS opening. This enables:
    // (1) tight degree check: deg(L_data) < shift_size via G of size shift_size
    // (2) zero-prefix enforcement: PCS opens [X^s·L_data] against κ^s·l_data, which fails if prefix ≠ 0
    std::vector<FF> evals;
    evals.reserve((3 * NUM_WIRES) + 1);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF l_data = left_table[idx].evaluate(kappa) * kappa_to_s.invert();
        transcript->send_to_verifier("LEFT_TABLE_EVAL_" + std::to_string(idx), l_data);
        // Store the SHIFTED eval (κ^s · l_data) for Shplonk — this is what the PCS opens [L'] against
        evals.emplace_back(kappa_to_s * l_data);
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
