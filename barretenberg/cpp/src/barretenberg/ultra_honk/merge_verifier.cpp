// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "merge_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

/**
 * @brief Verify proper construction of the aggregate Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
 * @details Let \f$l_j\f$, \f$r_j\f$, \f$m_j\f$ be three vectors. The Merge wants to convince the verifier that the
 * polynomials l_j, r_j, m_j for which they have sent commitments [l_j], [r_j], [m_j] satisfy
 *      - m_j(X) = l_j(X) + X^l r_j(X)      (1)
 *      - deg(l_j(X)) < k                   (2)
 * where k = shift_size.
 *
 * To check condition (1), the verifier samples a challenge kappa and request from the prover a proof that
 * the polynomial
 *      p_j(X) = l_j(kappa) + kappa^k r_j(kappa) - m_j(kappa)
 * opens to 0 at kappa.
 *
 * To check condition (2), the verifier requests from the prover the commitment to a polynomial g_j, and
 * then requests proofs that
 *      l_j(1/kappa) = c     g_j(kappa) = d
 * Then, they verify c * kappa^{k-1} = d, which implies, up to negligible probability, that
 * g_j(X) = X^{l-1} l_j(1/X), which means that deg(l_j(X)) < l.
 *
 * The verifier must therefore check 12 opening claims: p_j(kappa) = 0, l_j(1/kappa), g_j(kappa)
 * We use Shplonk to verify the claims with a single MSM (instead of computing [p_j] from [l_j], [r_j], [m_j]
 * and then open it). We initialize the Shplonk verifier with the following commitments:
 *      [l_1], [r_1], [m_1], [g_1], ..., [l_4], [r_4], [m_4], [g_4]
 * Then, we verify the various claims:
 *     - p_j(kappa) = 0:     The commitment to p_j is constructed from the commitments to l_j, r_j, m_j, so
 *                           the claim passed to the Shplonk verifier specifies the indices of these commitments in
 *                           the above vector: {4 * (j-1), 4 * (j-1) + 1, 4 * (j-1) + 2}, the coefficients
 *                           reconstructing p_j from l_j, r_j, m_j: {1, kappa^k, -1}, and the claimed
 *                           evaluation: 0.
 *     - l_j(1/kappa) = v_j: The index in this case is {4 * (j-1)}, the coefficient is { 1 }, and the evaluation is
 *                           v_j.
 *     - g_j(kappa) = w_j:   The index is {3 + 4 * (j-1)}, the coefficient is { 1 }, and the evaluation is w_j.
 * The claims are passed in the following order:
 *   {kappa, 0}, {kappa, 0}, {kappa, 0}, {kappa, 0}, {1/kappa, v_1}, {kappa, w_1}, .., {1/kappa, v_4}, {kappa, w_4}
 *
 * In the Goblin scenario, we have:
 * - \f$l_j = t_j, r_j = T_{prev,j}, m_j = T_j\f$ if we are prepending the subtable
 * - \f$l_j = T_{prev,j}, r_j = t_j, m_j = T_j\f$ if we are appending the subtable
 *
 * @tparam Curve_
 * @param proof
 * @param inputs_commitments The commitments used by the Merge verifier
 * @return std::pair<PairingPoints, TableCommitments> Pair of the pairing points for verification and the commitments
 * to the merged tables as read from the proof
 */
template <typename Curve>
typename MergeVerifier_<Curve>::VerificationResult MergeVerifier_<Curve>::verify_proof(
    const Proof& proof, const InputCommitments& input_commitments)
{
    transcript->load_proof(proof);

    // Receive shift size from prover
    // For native: shift_size is uint32_t
    // For stdlib: shift_size is FF (we'll get the value later)
    const FF shift_size = transcript->template receive_from_prover<FF>("shift_size");
    ;
    if constexpr (IsRecursive) {
        BB_ASSERT_GT(uint32_t(shift_size.get_value()), 0U, "Shift size should always be bigger than 0");
    } else {

        BB_ASSERT_GT(shift_size, 0U, "Shift size should always be bigger than 0");
    }

    // Store T_commitments of the verifier
    TableCommitments merged_table_commitments;

    // Vector of commitments
    // The vector is composed of: [L_1], .., [L_4], [R_1], .., [R_4], [M_1], .., [M_4], [G]
    std::vector<Commitment> table_commitments;
    table_commitments.reserve((3 * NUM_WIRES) + 1);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(settings == MergeSettings::PREPEND ? input_commitments.t_commitments[idx]
                                                                          : input_commitments.T_prev_commitments[idx]);
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(settings == MergeSettings::PREPEND ? input_commitments.T_prev_commitments[idx]
                                                                          : input_commitments.t_commitments[idx]);
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("MERGED_TABLE_" + std::to_string(idx)));
        merged_table_commitments[idx] = table_commitments.back();
    }

    // Generate degree check batching challenges
    std::array<std::string, NUM_WIRES> labels_degree_check;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        labels_degree_check[idx] = "LEFT_TABLE_DEGREE_CHECK_" + std::to_string(idx);
    }
    std::array<FF, NUM_WIRES> degree_check_challenges =
        transcript->template get_challenges<FF, NUM_WIRES>(labels_degree_check);

    // Receive commitment to reversed batched left table
    table_commitments.emplace_back(
        transcript->template receive_from_prover<Commitment>("REVERSED_BATCHED_LEFT_TABLES"));

    // Compute batching challenges
    std::vector<std::string> labels_shplonk_batching_challenges((3 * NUM_WIRES) + 1);
    for (size_t idx = 0; idx < 3 * NUM_WIRES + 1; idx++) {
        labels_shplonk_batching_challenges[idx] = "SHPLONK_MERGE_BATCHING_CHALLENGE_" + std::to_string(idx);
    }
    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_challenges<FF>(labels_shplonk_batching_challenges);

    // Evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF kappa_inv = kappa.invert();
    const FF pow_kappa = kappa.pow(shift_size);
    const FF pow_kappa_minus_one = pow_kappa * kappa_inv;

    // Receive evaluations of [L_i], [R_i], [M_i] at kappa
    std::vector<FF> evals;
    evals.reserve((3 * NUM_WIRES) + 1);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("LEFT_TABLE_EVAL_" + std::to_string(idx)));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("RIGHT_TABLE_EVAL_" + std::to_string(idx)));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("MERGED_TABLE_EVAL_" + std::to_string(idx)));
    }

    // Receive evaluation of G at 1/kappa
    evals.emplace_back(transcript->template receive_from_prover<FF>("REVERSED_BATCHED_LEFT_TABLES_EVAL"));

    // Check concatenation identities
    bool concatenation_verified = true;
    FF concatenation_diff(0);
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        concatenation_diff = evals[idx] + (pow_kappa * evals[idx + NUM_WIRES]) - evals[idx + (2 * NUM_WIRES)];
        if constexpr (IsRecursive) {
            concatenation_diff.assert_equal(FF(0),
                                            "assert_equal: merge concatenation identity failed in Merge Verifier");
            concatenation_verified &= concatenation_diff.get_value() == 0;
        } else {
            concatenation_verified &= concatenation_diff == 0;
        }
    }

    // Check degree identity
    bool degree_check_verified = true;
    FF degree_check_diff(0);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        degree_check_diff += evals[idx] * degree_check_challenges[idx];
    }
    degree_check_diff -= evals.back() * pow_kappa_minus_one;
    if constexpr (IsRecursive) {
        degree_check_diff.assert_equal(FF(0), "assert_equal: merge degree identity failed in Merge Verifier");
        degree_check_verified &= degree_check_diff.get_value() == 0;
    } else {
        degree_check_verified &= degree_check_diff == 0;
    }

    // Receive Shplonk batched quotient
    Commitment shplonk_batched_quotient =
        transcript->template receive_from_prover<Commitment>("SHPLONK_BATCHED_QUOTIENT");

    // Generate Shplonk opening challenge
    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("shplonk_opening_challenge");

    // Prepare batched opening claim to be passed to KZG
    BatchOpeningClaim<Curve> batch_opening_claim;

    batch_opening_claim.commitments = { shplonk_batched_quotient };
    for (auto& commitment : table_commitments) {
        batch_opening_claim.commitments.emplace_back(-std::move(commitment));
    }
    if constexpr (IsRecursive) {
        batch_opening_claim.commitments.emplace_back(Commitment::one(kappa.get_context()));
    } else {
        batch_opening_claim.commitments.emplace_back(Commitment::one());
    }

    batch_opening_claim.scalars = { (shplonk_opening_challenge - kappa) };
    for (auto& scalar : shplonk_batching_challenges) {
        batch_opening_claim.scalars.emplace_back(std::move(scalar));
    }
    batch_opening_claim.scalars.back() *=
        (shplonk_opening_challenge - kappa) * (shplonk_opening_challenge - kappa_inv).invert();

    batch_opening_claim.scalars.emplace_back(FF(0));
    for (size_t idx = 0; idx < evals.size(); idx++) {
        if (idx < evals.size() - 1) {
            batch_opening_claim.scalars.back() += evals[idx] * shplonk_batching_challenges[idx];
        } else {
            batch_opening_claim.scalars.back() += shplonk_batching_challenges.back() * evals.back() *
                                                  (shplonk_opening_challenge - kappa) *
                                                  (shplonk_opening_challenge - kappa_inv).invert();
        }
    }

    batch_opening_claim.evaluation_point = { shplonk_opening_challenge };

    size_t num_rows = 0;
    if constexpr (IsRecursive) {
        if constexpr (IsMegaBuilder<typename Curve::Builder>) {
            num_rows = kappa.get_context()->op_queue->get_num_rows();
        }
    };
    // KZG verifier - returns PairingPoints directly
    PairingPoints pairing_points = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, transcript);

    if constexpr (IsRecursive) {
        if constexpr (IsMegaBuilder<typename Curve::Builder>) {
            info("NUM ROWS ADDED: ", kappa.get_context()->op_queue->get_num_rows() - num_rows);
        }
    };

    return { pairing_points, merged_table_commitments, degree_check_verified };
}

// Explicit template instantiations
template class MergeVerifier_<curve::BN254>;
template class MergeVerifier_<stdlib::bn254<MegaCircuitBuilder>>;
template class MergeVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
