// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "merge_verifier.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

MergeVerifier::MergeVerifier(const std::shared_ptr<Transcript>& transcript, MergeSettings settings)
    : transcript(transcript)
    , settings(settings){};

/**
 * @brief Verify proper construction of the aggregate Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
 * @details Let \f$l_j\f$, \f$r_j\f$, \f$m_j\f$ be three vectors. The Merge prover wants to convince the verifier that
 * \f$\deg(l_j) < k\f$, and that \f$m_j = l_j + right_shift(r_j, k)\f$. The protocol demonstrates the validity of these
 * claims by:
 * - the Schwartz-Zippel check:
 *      \f[ m_j(\kappa) = l_j(\kappa) + \kappa^k * r_j(\kappa) \f]
 * - the degree check a la Thakur:
 *      \f[ \kappa^{l-1} l_j(1/\kappa) = g_j(\kappa) \f]
 *   where \f$g_j(X) = X^{k-1} l_j(1 / X)\f$.
 *
 * In the Goblin scenario, we have:
 * - \f$l_j = t_j, r_j = T_{prev,j}, m_j = T_j\f$ if we are prepending the subtable
 * - \f$l_j = T_{prev,j}, r_j = t_j, m_j = T_j\f$ if we are appending the subtable
 *
 * @param proof
 * @param t_commitments The commitments to t_j read from the transcript by the PG verifier with which the Merge
 * verifier shares a transcript
 * @return bool Verification result
 */
bool MergeVerifier::verify_proof(const HonkProof& proof, const RefArray<Commitment, NUM_WIRES>& t_commitments)
{
    /**
     * The prover wants to convince the verifier that the polynomials l_j, r_j, m_j for which they have sent
     *      - m_j(X) = l_j(X) + X^l r_j(X)      (1)
     *      - deg(l_j(X)) < k                   (2)
     * where l = shift_size.
     *
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
     * g_j(X) = X^{l-1} t_j(1/X), which means that deg(l_j(X)) < l.
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
     */

    transcript->load_proof(proof);

    const uint32_t shift_size = transcript->template receive_from_prover<uint32_t>("shift_size");

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
    size_t commitment_idx = 2;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_commitments[idx] = table_commitments[commitment_idx];
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
        Claims claim{ { /*index of [l_j]*/ commitment_idx,
                        /*index of [r_j]*/ commitment_idx + 1,
                        /*index of [m_j]*/ commitment_idx + 2 },
                      { FF::one(), pow_kappa, FF::neg_one() },
                      { kappa, FF::zero() } };
        opening_claims.emplace_back(claim);

        // Move commitment_idx to the index of [l_{j+1}]
        commitment_idx += NUM_WIRES;
    }

    // Boolean keeping track of the degree identities
    bool degree_check_verified = true;

    // Add opening claim for l_j(1/kappa), g_j(kappa) and check g_j(kappa) = l_j(1/kappa) * kappa^{k-1}
    commitment_idx = 0;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        Claims claim;

        // Opening claim for l_j(1/kappa)
        FF left_table_eval_kappa_inv =
            transcript->template receive_from_prover<FF>("left_table_eval_kappa_inv_" + std::to_string(idx));
        claim = { { commitment_idx }, { FF::one() }, { kappa_inv, left_table_eval_kappa_inv } };
        opening_claims.emplace_back(claim);

        // Move commitment_idx to index of g_j
        commitment_idx += 3;

        // Opening claim for g_j(kappa)
        FF left_table_reversed_eval =
            transcript->template receive_from_prover<FF>("left_table_reversed_eval_" + std::to_string(idx));
        claim = { { commitment_idx }, { FF::one() }, { kappa, left_table_reversed_eval } };
        opening_claims.emplace_back(claim);

        // Move commitment_idx to index of left_table_{j+1}
        commitment_idx += 1;

        // Degree identity
        degree_check_verified &= (left_table_eval_kappa_inv * pow_kappa_minus_one == left_table_reversed_eval);
    }

    // Initialize Shplonk verifier
    ShplonkVerifier verifier(table_commitments, transcript, opening_claims.size());
    verifier.reduce_verification_vector_claims_no_finalize(opening_claims);

    // Export batched claim
    auto batch_opening_claim = verifier.export_batch_opening_claim(Commitment::one());

    // KZG verifier
    auto pairing_points = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, transcript);
    VerifierCommitmentKey pcs_vkey{};
    bool claims_verified = pcs_vkey.pairing_check(pairing_points[0], pairing_points[1]);

    return degree_check_verified && claims_verified;
}
} // namespace bb
