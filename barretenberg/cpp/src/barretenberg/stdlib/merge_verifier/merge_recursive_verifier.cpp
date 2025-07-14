// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/merge_verifier/merge_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"

namespace bb::stdlib::recursion::goblin {

template <typename CircuitBuilder>
MergeRecursiveVerifier_<CircuitBuilder>::MergeRecursiveVerifier_(CircuitBuilder* builder,
                                                                 const std::shared_ptr<Transcript>& transcript,
                                                                 MergeSettings settings)
    : builder(builder)
    , transcript(transcript)
    , settings(settings)
{}

/**
 * @brief Computes inputs to a pairing check that, if verified, establishes proper construction of the aggregate
 * Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
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
 * @tparam CircuitBuilder
 * @param proof
 * @param t_commitments The commitments to t_j read from the transcript by the PG recursive verifier with which
 * the Merge recursive verifier shares a transcript
 * @return PairingPoints Inputs to final pairing
 */
template <typename CircuitBuilder>
MergeRecursiveVerifier_<CircuitBuilder>::PairingPoints MergeRecursiveVerifier_<CircuitBuilder>::verify_proof(
    const stdlib::Proof<CircuitBuilder>& proof, const RefArray<Commitment, NUM_WIRES> t_commitments)
{
    using Claims = typename ShplonkVerifier_<Curve>::LinearCombinationOfClaims;

    transcript->load_proof(proof);

    FF shift_size = transcript->template receive_from_prover<FF>("shift_size");
    ASSERT(shift_size.get_value() > 0, "Shift size should always be bigger than 0");

    // Vector of commitments to be passed to the Shplonk verifier
    // The vector is composed of: [l_1], [r_1], [m_1], [g_1], ..., [l_4], [r_4], [m_4], [g_4]
    std::vector<Commitment> table_commitments;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        if (settings == MergeSettings::PREPEND) {
            table_commitments.emplace_back(t_commitments[idx]);
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1473): remove receiving commitment to T_prev
            table_commitments.emplace_back(
                transcript->template receive_from_prover<Commitment>("T_PREV_" + std::to_string(idx)));
        } else {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1473): remove receiving commitment to T_prev
            table_commitments.emplace_back(
                transcript->template receive_from_prover<Commitment>("T_PREV_" + std::to_string(idx)));
            table_commitments.emplace_back(t_commitments[idx]);
        }
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("MERGED_TABLE_" + std::to_string(idx)));
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("LEFT_TABLE_REVERSED_" + std::to_string(idx)));
    }

    // Store T_commitments of the verifier
    size_t commitment_idx = 2; // Index of [m_j = T_j] in the vector of commitments
    for (auto& commitment : T_commitments) {
        commitment = table_commitments[commitment_idx];
        commitment_idx += NUM_WIRES;
    }

    // Evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF kappa_inv = kappa.invert();
    const FF pow_kappa = kappa.pow(shift_size);
    const FF pow_kappa_minus_one = pow_kappa * kappa_inv;

    // Opening claims to be passed to the Shplonk verifier
    std::vector<Claims> opening_claims;

    // Add opening claim for p_j(X) = l_j(X) + X^k r_j(X) - m_j(X)
    commitment_idx = 0;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        opening_claims.emplace_back(Claims{ { /*index of [l_j]*/ commitment_idx,
                                              /*index of [r_j]*/ commitment_idx + 1,
                                              /*index of [m_j]*/ commitment_idx + 2 },
                                            { FF(1), pow_kappa, FF(-1) },
                                            { kappa, FF(0) } });

        // Move commitment_idx to the index of [l_{j+1}]
        commitment_idx += NUM_WIRES;
    }

    // Add opening claim for l_j(1/kappa), g_j(kappa) and check g_j(kappa) = l_j(1/kappa) * kappa^{k-1}
    commitment_idx = 0;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Opening claim for l_j(1/kappa)
        FF left_table_eval_kappa_inv =
            transcript->template receive_from_prover<FF>("left_table_eval_kappa_inv_" + std::to_string(idx));
        opening_claims.emplace_back(
            Claims{ { /*index of [l_j]*/ commitment_idx }, { FF(1) }, { kappa_inv, left_table_eval_kappa_inv } });

        // Opening claim for g_j(kappa)
        FF left_table_reversed_eval =
            transcript->template receive_from_prover<FF>("left_table_reversed_eval_" + std::to_string(idx));
        opening_claims.emplace_back(
            Claims{ { /*index of [g_j]*/ commitment_idx + 3 }, { FF(1) }, { kappa, left_table_reversed_eval } });

        // Move commitment_idx to index of left_table_{j+1}
        commitment_idx += NUM_WIRES;

        // Degree identity
        left_table_reversed_eval.assert_equal(left_table_eval_kappa_inv * pow_kappa_minus_one);
    }

    // Initialize Shplonk verifier
    ShplonkVerifier_<Curve> verifier(table_commitments, transcript, opening_claims.size());
    verifier.reduce_verification_vector_claims_no_finalize(opening_claims);

    // Export batched claim
    auto batch_opening_claim = verifier.export_batch_opening_claim(Commitment::one(kappa.get_context()));

    // KZG verifier
    return KZG::reduce_verify_batch_opening_claim(batch_opening_claim, transcript);
}

template class MergeRecursiveVerifier_<MegaCircuitBuilder>;
template class MergeRecursiveVerifier_<UltraCircuitBuilder>;

} // namespace bb::stdlib::recursion::goblin
