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
 * @details Let T_j be the jth column of the aggregate ecc op table after prepending the subtable columns t_j containing
 * the contribution from a single circuit. T_{j,prev} corresponds to the columns of the aggregate table at the
 * previous stage. For each column we have the relationship T_j = t_j + right_shift(T_{j,prev}, k), where k is the
 * length of the subtable columns t_j. This protocol demonstrates that the aggregate ecc op table has been
 * constructed correctly via:
 * - the Schwartz-Zippel check:
 *      \f[ T_j(\kappa) = t_j(\kappa) + \kappa^k * (T_{j,prev}(\kappa)) \f]
 * - the degree check a la Thakur:
 *      \f[ x^{l-1} t_j(1/x) = g_j(x) \f]
 *   where \f$g_j(X) = X^{l-1} t_j(1 / X)\f$.
 *
 * @tparam Flavor
 * @param t_commitments The commitments to t_j read from the transcript by the PG verifier with which the Merge verifier
 * shares a transcript
 * @return bool Verification result
 */
bool MergeVerifier::verify_proof(const HonkProof& proof, const RefArray<Commitment, NUM_WIRES>& t_commitments)
{
    transcript->load_proof(proof);

    // clang-format off
    /**
     * Shplonk verification checks the following openings: p_j(kappa), g_j(kappa), t_j(1/kappa)
     * The polynomials p_j(X) have the form: p_j(X) = t_j(X) - kappa^l T_{j,prev}(X) - T_j(X). Therefore, the verifier
     * must compute the commitment to p_j starting from the commitments to t_j, T_{j,prev}, T_j. To avoid unnecessary
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
     *   1     0     0     0      kappa^l        0             0           0        -1     0     0     0     0     0     0     0            kappa
     *   0     1     0     0         0         kappa^l         0           0         0    -1     0     0     0     0     0     0            kappa
     *   0     0     1     0         0           0          kappa^l        0         0     0    -1     0     0     0     0     0            kappa
     *   0     0     0     1         0           0             0        kappa^l      0     0     0    -1     0     0     0     0            kappa
     *   0     0     0     0         0           0             0           0         0     0     0     0     1     0     0     0            kappa
     *   1     0     0     0         0           0             0           0         0     0     0     0     0     0     0     0           1/kappa
     *   0     0     0     0         0           0             0           0         0     0     0     0     0     1     0     0            kappa
     *   0     1     0     0         0           0             0           0         0     0     0     0     0     0     0     0           1/kappa
     *   0     0     0     0         0           0             0           0         0     0     0     0     0     0     1     0            kappa
     *   0     0     1     0         0           0             0           0         0     0     0     0     0     0     0     0           1/kappa
     *   0     0     0     0         0           0             0           0         0     0     0     0     0     0     0     1            kappa
     *   0     0     0     1         0           0             0           0         0     0     0     0     0     0     0     0           1/kappa
     *
     */
    // clang-format on

    static constexpr size_t NUM_CLAIMS = 3 * NUM_WIRES;

    uint32_t subtable_size = transcript->template receive_from_prover<uint32_t>("subtable_size");

    // Commitments used by the Shplonk verifier
    std::vector<Commitment> commitments;
    commitments.reserve(4 * NUM_WIRES);

    // [t_j]
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        commitments.emplace_back(t_commitments[idx]);
    }

    // Receive [T_{j,prev}], [T_j], [g_j]
    std::array<std::string, 3> labels{ "T_PREV_", "T_CURRENT_", "REVERSED_t_CURRENT_" };
    for (size_t idx = 0; idx < 3; ++idx) {
        std::string label = labels[idx];
        for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
            std::string suffix = std::to_string(wire_idx);
            commitments.emplace_back(transcript->template receive_from_prover<Commitment>(label + suffix));
        }
    }

    // Evaluation challenge
    FF kappa = transcript->template get_challenge<FF>("kappa");
    FF pow_kappa_minus_one = kappa.pow(subtable_size - 1);
    FF kappa_inv = kappa.invert();
    FF pow_kappa = pow_kappa_minus_one * kappa;

    // Boolean keep track of t_j(1/kappa) * kappa^{l-1} = g_j(kappa)
    bool degree_identity_checked = true;

    // Indices and opening vectors
    std::vector<std::vector<size_t>> indices;
    std::vector<OpeningVector> opening_vectors;
    indices.reserve(NUM_CLAIMS);
    opening_vectors.reserve(NUM_CLAIMS);

    // Add opening claim for t_j(kappa) + kappa^l T_{j,prev}(kappa) - T_j(kappa) = 0
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Evaluation is hard-coded to zero as that is the target
        // Note that it is not necessarily true that each polynomial evaluates to zero, but for our purposes we only
        // need to ensure that the Shplonk verifier tests p_j(kappa) = 0. Setting all evaluations to zero is a hack to
        // enforce that the Shplonk verifier performs this check.
        OpeningVector tmp_vector(
            kappa, { FF::one(), pow_kappa, FF::neg_one() }, { FF::zero(), FF::zero(), FF::zero() });
        std::vector<size_t> tmp_idx{ idx, idx + NUM_WIRES, idx + 2 * NUM_WIRES };
        opening_vectors.emplace_back(tmp_vector);
        indices.emplace_back(tmp_idx);
    }
    // Add opening claim for g_j(kappa),  t_j(1/kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF reversed_t_eval = transcript->template receive_from_prover<FF>("reversed_t_eval_" + std::to_string(idx));
        FF t_eval_kappa_inv = transcript->template receive_from_prover<FF>("t_evals_kappa_inv_" + std::to_string(idx));

        {
            OpeningVector tmp_vector(kappa, { FF::one() }, { reversed_t_eval });
            std::vector<size_t> tmp_idx{ idx + 3 * NUM_WIRES };
            opening_vectors.emplace_back(tmp_vector);
            indices.emplace_back(tmp_idx);
        }

        {
            OpeningVector tmp_vector(kappa_inv, { FF::one() }, { t_eval_kappa_inv });
            std::vector<size_t> tmp_idx{ idx };
            opening_vectors.emplace_back(tmp_vector);
            indices.emplace_back(tmp_idx);
        }

        // Check t_j(1/kappa) * kappa^{l-1} = g_j(kappa)
        degree_identity_checked &= (t_eval_kappa_inv * pow_kappa_minus_one == reversed_t_eval);
    }

    // Initialize Shplonk verifier
    ShplonkVerifier verifier(commitments, transcript, NUM_CLAIMS);
    verifier.reduce_verification_vector_claims_no_finalize(indices, opening_vectors);

    // Export batched claim
    auto batch_opening_claim = verifier.export_batch_opening_claim(Commitment::one());

    // KZG verifier
    auto pairing_points = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, transcript);
    VerifierCommitmentKey pcs_vkey{};
    auto verified = pcs_vkey.pairing_check(pairing_points[0], pairing_points[1]);

    // Store T_commitments of the verifier
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_commitments[idx] = commitments[idx + 2 * NUM_WIRES];
    }

    return degree_identity_checked && verified;
}
} // namespace bb
