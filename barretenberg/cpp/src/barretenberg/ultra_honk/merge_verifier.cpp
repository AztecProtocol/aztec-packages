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
 * @details Let \f$L_j\f$, \f$R_j\f$, \f$M_j\f$ be three vectors. The Merge prover wants to convince the verifier that,
 * for j = 1, 2, 3, 4:
 *      - \f$M_j(X) = L_j(X) + X^l R_j(X)\f$      (1)
 *      - \f$deg(L_j(X)) < k\f$                   (2)
 * where k = shift_size.
 *
 * 1. The prover commits to \f$L_i, R_j, M_j\f$ and receives from the verifier batching challenges \f$alpha_1, \dots,
 *    \alpha_4\f$
 * 2. The prover computes \f$G(X) = X^{k-1}(\sum_i \alpha_i L_i(X))\f$ and commits to it.
 * 3. The prover receives from the verifier an evaluation challenge \f$\kappa\f$ and sends evaluations
 *    \f$l_j = L_j(\kappa), r_j = R_j(\kappa), m_j = M_j(\kappa), g = G(\kappa^{-1}\f$.
 * 4. The prover uses Shplonk to open the commitments to the relevant points.
 *
 * @note The prover doesn't commit to t_j because it shares a transcript with the HN instance that folds
 * the present circuit, and therefore t_j has already been added to the transcript by HN. Similarly, it doesn't commit
 * to T_{prev, j} because the transcript is shared by entire recursive verification and therefore T_{prev, j} has been
 * added to the transcript in the previous round of Merge verification.
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
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(labels_degree_check);

    // Receive commitment to reversed batched left table
    table_commitments.emplace_back(
        transcript->template receive_from_prover<Commitment>("REVERSED_BATCHED_LEFT_TABLES"));

    // Compute batching challenges
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
    bool concatenation_verified = check_concatenation_identities(evals, pow_kappa);

    // Check degree identity
    bool degree_check_verified = check_degree_identity(evals, pow_kappa_minus_one, degree_check_challenges);

    // Receive Shplonk batched quotient
    Commitment shplonk_batched_quotient =
        transcript->template receive_from_prover<Commitment>("SHPLONK_BATCHED_QUOTIENT");

    // Generate Shplonk opening challenge
    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("shplonk_opening_challenge");

    // Prepare batched opening claim to be passed to KZG
    BatchOpeningClaim<Curve> batch_opening_claim = compute_shplonk_opening_claim(table_commitments,
                                                                                 shplonk_batched_quotient,
                                                                                 shplonk_opening_challenge,
                                                                                 shplonk_batching_challenges,
                                                                                 kappa,
                                                                                 kappa_inv,
                                                                                 evals);

    // KZG verifier - returns PairingPoints directly
    PairingPoints pairing_points = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, transcript);

    return { pairing_points, merged_table_commitments, degree_check_verified, concatenation_verified };
}

// Explicit template instantiations
template class MergeVerifier_<curve::BN254>;
template class MergeVerifier_<stdlib::bn254<MegaCircuitBuilder>>;
template class MergeVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
