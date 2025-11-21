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

template <typename Curve>
bool MergeVerifier_<Curve>::check_concatenation_identities(std::vector<FF>& evals, const FF& pow_kappa) const
{
    bool concatenation_verified = true;
    FF concatenation_diff(0);
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        concatenation_diff = evals[idx] + (pow_kappa * evals[idx + NUM_WIRES]) - evals[idx + (2 * NUM_WIRES)];
        if constexpr (IsRecursive) {
            concatenation_verified &= concatenation_diff.get_value() == 0;
            concatenation_diff.assert_equal(FF(0),
                                            "assert_equal: merge concatenation identity failed in Merge Verifier");
        } else {
            concatenation_verified &= concatenation_diff == 0;
        }
    }
    return concatenation_verified;
}

template <typename Curve>
bool MergeVerifier_<Curve>::check_degree_identity(std::vector<FF>& evals,
                                                  const FF& pow_kappa_minus_one,
                                                  const std::vector<FF>& degree_check_challenges) const
{
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

    return degree_check_verified;
}

template <typename Curve>
BatchOpeningClaim<Curve> MergeVerifier_<Curve>::compute_shplonk_opening_claim(
    const std::vector<Commitment>& table_commitments,
    const Commitment& shplonk_batched_quotient,
    const FF& shplonk_opening_challenge,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    const std::vector<FF>& evals) const
{
    // Claim {Q', (z, 0)} expressed as
    // Q' = -Q * (z - \kappa) +
    //      + \sum_i \beta_i L_i - \sum_i \beta_i R_i - \sum_i \beta_i M_i
    //      + (z - \kappa) / (z - \kappa^{-1}) * \beta_i G
    //      - \sum_i \beta_i l_i - \sum_i \beta_i r_i - \sum_i \beta_i m_i
    //      - (z - \kappa) / (z - \kappa^{-1}) * \beta_i * g
    BatchOpeningClaim<Curve> batch_opening_claim;

    // Commitment: [L_1], [L_2], ..., [L_n], [R_1], ..., [R_n], [M_1], ..., [M_n], [G], [1]
    batch_opening_claim.commitments = { std::move(shplonk_batched_quotient) };
    for (auto& commitment : table_commitments) {
        batch_opening_claim.commitments.emplace_back(std::move(commitment));
    }
    if constexpr (IsRecursive) {
        batch_opening_claim.commitments.emplace_back(Commitment::one(kappa.get_context()));
    } else {
        batch_opening_claim.commitments.emplace_back(Commitment::one());
    }

    // Scalars:
    // -(shplonk_opening_challenge - kappa), \beta_1, ..., \beta_12,
    // \beta_13 * (z - \kappa) / (z - \kappa^{-1})
    // - ( \sum_i \beta_i l_i + \sum_i \beta_i r_i + \sum_i \beta_i m_i
    //          + \beta_13 * (z - \kappa) / (z - \kappa^{-1})* g )
    batch_opening_claim.scalars = { -(shplonk_opening_challenge - kappa) };
    for (auto& scalar : shplonk_batching_challenges) {
        batch_opening_claim.scalars.emplace_back(std::move(scalar));
    }
    batch_opening_claim.scalars.back() *=
        (shplonk_opening_challenge - kappa) * (shplonk_opening_challenge - kappa_inv).invert();

    batch_opening_claim.scalars.emplace_back(FF(0));
    for (size_t idx = 0; idx < evals.size(); idx++) {
        if (idx < evals.size() - 1) {
            batch_opening_claim.scalars.back() -= evals[idx] * shplonk_batching_challenges[idx];
        } else {
            batch_opening_claim.scalars.back() -= shplonk_batching_challenges.back() * evals.back() *
                                                  (shplonk_opening_challenge - kappa) *
                                                  (shplonk_opening_challenge - kappa_inv).invert();
        }
    }

    batch_opening_claim.evaluation_point = { shplonk_opening_challenge };

    return batch_opening_claim;
}

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
