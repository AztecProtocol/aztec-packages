// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "merge_verifier.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

MergeVerifier::MergeVerifier(const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript){};

/**
 * @brief Verify proper construction of the aggregate Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
 * @details Let T_j be the jth column of the aggregate ecc op table after prepending the subtable columns t_j
 * containing the contribution from a single circuit. T_{j,prev} corresponds to the columns of the aggregate table
 * at the previous stage. For each column we have the relationship T_j = t_j + right_shift(T_{j,prev}, k), where k
 * is the length of the subtable columns t_j. This protocol demonstrates that the aggregate ecc op table has been
 * constructed correctly via:
 * - the Schwartz-Zippel check:
 *      \f[ T_j(\kappa) = t_j(\kappa) + \kappa^k * (T_{j,prev}(\kappa)) \f]
 * - the degree check a la Thakur:
 *      \f[ x^{l-1} t_j(1/x) = g_j(x) \f]
 *   where \f$g_j(X) = X^{l-1} t_j(1 / X)\f$.
 *
 * @tparam Flavor
 * @param t_commitments The commitments to t_j read from the transcript by the PG verifier with which the Merge
 * verifier shares a transcript
 * @return bool Verification result
 */
bool MergeVerifier::verify_proof(const HonkProof& proof, const RefArray<Commitment, NUM_WIRES>& t_commitments)
{
    transcript->load_proof(proof);

    // clang-format off
    /**
     * Shplonk verification checks the following openings: t_j(1/kappa), p_j(kappa), g_j(kappa)
     * The polynomials p_j(X) have the form: p_j(X) = t_j(X) - kappa^l T_{prev, j}(X) - T_j(X). Therefore, the verifier
     * must compute the commitment to p_j starting from the commitments to t_j, T_{prev, j}, T_j. To avoid unnecessary
     * ECC operations, we set up the Shplonk verifier as follows.
     *
     * ShplonkVerifier.commitments = {
     *      [t_1], .., [t_4], [T_{1,prev}], .., [T_{4, prev}], [T_1], .., [T_4], [g_1], .., [g_4]
     * }
     *
     * And then we open the claims by linearly combining the commitments:
     *
     * [t_1] [t_2] [t_3] [t_4] [T_{1,prev}] [T_{2,prev}] [T_{3,prev}] [T_{4 prev}] [T_1] [T_2] [T_3] [T_4] [g_1] [g_2] [g_3] [g_4] / evaluation_challenge
     *
     *   1     0     0     0         0           0             0           0         0     0     0     0     0     0     0     0           1/kappa
     *   0     1     0     0         0           0             0           0         0     0     0     0     0     0     0     0           1/kappa
     *   0     0     1     0         0           0             0           0         0     0     0     0     0     0     0     0           1/kappa
     *   0     0     0     1         0           0             0           0         0     0     0     0     0     0     0     0           1/kappa
     *   1     0     0     0      kappa^l        0             0           0        -1     0     0     0     0     0     0     0            kappa
     *   0     1     0     0         0         kappa^l         0           0         0    -1     0     0     0     0     0     0            kappa
     *   0     0     1     0         0           0          kappa^l        0         0     0    -1     0     0     0     0     0            kappa
     *   0     0     0     1         0           0             0        kappa^l      0     0     0    -1     0     0     0     0            kappa
     *   0     0     0     0         0           0             0           0         0     0     0     0     1     0     0     0            kappa
     *   0     0     0     0         0           0             0           0         0     0     0     0     0     1     0     0            kappa
     *   0     0     0     0         0           0             0           0         0     0     0     0     0     0     1     0            kappa
     *   0     0     0     0         0           0             0           0         0     0     0     0     0     0     0     1            kappa
     *
     */
    // clang-format on

    uint32_t subtable_size = transcript->template receive_from_prover<uint32_t>("subtable_size");

    // Vector of commitments to be passed to the Shplonk verifier
    // The vector is composed of: [t_1], [T_{prev,1}], [T_1], [g_1], ..., [t_4], [T_{prev,4], [T_4], [g_4]
    std::vector<Commitment> table_commitments;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(t_commitments[idx]);
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("T_PREV_" + std::to_string(idx)));
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("T_" + std::to_string(idx)));
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("t_REVERSED_" + std::to_string(idx)));
    }

    // Store T_commitments of the verifier
    size_t commitment_idx = 2;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_commitments[idx] = table_commitments[idx + commitment_idx];
        commitment_idx += NUM_WIRES;
    }

    // Evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF kappa_inv = kappa.invert();
    const FF pow_kappa_minus_one = kappa.pow(subtable_size - 1);
    const FF pow_kappa = pow_kappa_minus_one * kappa;

    // Opening claims to be passed to the Shplonk verifier
    std::vector<Claims> opening_claims;

    // Add opening claim for t_j(kappa) + kappa^l T_{j,prev}(kappa) - T_j(kappa) = 0
    commitment_idx = 0;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Evaluation is hard-coded to zero
        Claims claim{ { /*index of t_j*/ commitment_idx,
                        /*index of T_{prev,j}*/ commitment_idx + 1,
                        /*index of T_j*/ commitment_idx + 2 },
                      { FF::one(), pow_kappa, FF::neg_one() },
                      { kappa, FF::zero() } };
        opening_claims.emplace_back(claim);

        // Move commitment_idx to the index of t_{j+1}
        commitment_idx += NUM_WIRES;
    }

    // Boolean keeping track of the identities g_j(kappa) = t_j(1/kappa) * kappa^{l-1}
    bool degree_check_verified = true;

    // Add opening claim for t_j(1/kappa), g_j(kappa) and check g_j(kappa) = t_j(1/kappa) * kappa^{l-1}
    commitment_idx = 0;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        Claims claim;

        // Opening claim for t_j(1/kappa)
        FF t_eval_kappa_inv = transcript->template receive_from_prover<FF>("t_eval_kappa_inv_" + std::to_string(idx));
        claim = { { commitment_idx }, { FF::one() }, { kappa_inv, t_eval_kappa_inv } };
        opening_claims.emplace_back(claim);

        // Move commitment_idx to index of g_j
        commitment_idx += 3;

        // Opening claim for g_j(kappa)
        FF t_reversed_eval = transcript->template receive_from_prover<FF>("t_reversed_eval_" + std::to_string(idx));
        claim = { { commitment_idx }, { FF::one() }, { kappa, t_reversed_eval } };
        opening_claims.emplace_back(claim);

        // Move commitment_idx to index of t_j
        commitment_idx += 1;

        // Degree identity
        degree_check_verified &= (t_eval_kappa_inv * pow_kappa_minus_one == t_reversed_eval);
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
