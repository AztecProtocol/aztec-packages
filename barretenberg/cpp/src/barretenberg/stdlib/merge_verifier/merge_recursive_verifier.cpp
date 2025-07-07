// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/merge_verifier/merge_recursive_verifier.hpp"

namespace bb::stdlib::recursion::goblin {

template <typename CircuitBuilder>
MergeRecursiveVerifier_<CircuitBuilder>::MergeRecursiveVerifier_(CircuitBuilder* builder,
                                                                 const std::shared_ptr<Transcript>& transcript)
    : builder(builder)
    , transcript(transcript)
{}

/**
 * @brief Computes inputs to a pairing check that, if verified, establishes proper construction of the aggregate Goblin
 * ECC op queue polynomials T_j, j = 1,2,3,4.
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
 * @tparam CircuitBuilder
 * @param proof
 * @param t_commitments The commitments to t_j read from the transcript by the PG recursive verifier with which the
 * Merge recursive verifier shares a transcript
 * @return std::array<typename Flavor::GroupElement, 2> Inputs to final pairing
 */
template <typename CircuitBuilder>
MergeRecursiveVerifier_<CircuitBuilder>::PairingPoints MergeRecursiveVerifier_<CircuitBuilder>::verify_proof(
    const stdlib::Proof<CircuitBuilder>& proof, const RefArray<Commitment, NUM_WIRES> t_commitments)
{
    // Transform proof into a stdlib object
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
     *   1     0     0     0     -kappa^l        0             0           0        -1     0     0     0     0     0     0     0            kappa
     *   0     1     0     0         0        -kappa^l         0           0         0    -1     0     0     0     0     0     0            kappa
     *   0     0     1     0         0           0         -kappa^l        0         0     0    -1     0     0     0     0     0            kappa
     *   0     0     0     1         0           0             0       -kappa^l      0     0     0    -1     0     0     0     0            kappa
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

    FF subtable_size = transcript->template receive_from_prover<FF>("subtable_size");

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
    FF minus_pow_kappa = -pow_kappa_minus_one * kappa;

    // Indices and opening vectors
    std::vector<std::vector<size_t>> indices;
    std::vector<OpeningVector> opening_vectors;
    indices.reserve(NUM_CLAIMS);
    opening_vectors.reserve(NUM_CLAIMS);

    // Add opening claim for t_j(kappa) - kappa^l T_{j,prev}(kappa) - T_j(kappa) = 0
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF t_eval = transcript->template receive_from_prover<FF>("t_eval_" + std::to_string(idx));
        FF T_prev_eval = transcript->template receive_from_prover<FF>("T_prev_eval_" + std::to_string(idx));
        FF T_eval = transcript->template receive_from_prover<FF>("T_eval_" + std::to_string(idx));

        OpeningVector tmp_vector(kappa, { FF(1), minus_pow_kappa, FF(-1) }, { t_eval, T_prev_eval, T_eval });
        std::vector<size_t> tmp_idx{ idx, idx + NUM_WIRES, idx + 2 * NUM_WIRES };
        opening_vectors.emplace_back(tmp_vector);
        indices.emplace_back(tmp_idx);
    }
    // Add opening claim for g_j(kappa), t_j(1/kappa) and check that t_j(1/kappa) * kappa^{l-1} = g_j(kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF reversed_t_eval = transcript->template receive_from_prover<FF>("reversed_t_eval_" + std::to_string(idx));
        FF t_eval_kappa_inv = transcript->template receive_from_prover<FF>("t_evals_kappa_inv_" + std::to_string(idx));

        {
            OpeningVector tmp_vector(kappa, { FF(1) }, { reversed_t_eval });
            std::vector<size_t> tmp_idx{ idx + 3 * NUM_WIRES };
            opening_vectors.emplace_back(tmp_vector);
            indices.emplace_back(tmp_idx);
        }

        {
            OpeningVector tmp_vector(kappa_inv, { FF(1) }, { t_eval_kappa_inv });
            std::vector<size_t> tmp_idx{ idx };
            opening_vectors.emplace_back(tmp_vector);
            indices.emplace_back(tmp_idx);
        }

        // Check t_j(1/kappa) * kappa^{l-1} = g_j(kappa)
        reversed_t_eval.assert_equal(t_eval_kappa_inv * pow_kappa_minus_one);
    }

    // Initialize Shplonk verifier
    ShplonkVerifier verifier(commitments, transcript, NUM_CLAIMS);

    // Get z_challenge and compute vanishing evals, we save one inversion in this way
    FF shplonk_z_challenge = verifier.get_z_challenge();
    std::array<FF, 2> inverse_vanishing_evals{ (shplonk_z_challenge - kappa).invert(),
                                               (shplonk_z_challenge - kappa_inv).invert() };

    // Update state of the verifier
    bool is_kappa_inv_claim = false;
    for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
        if (is_kappa_inv_claim) {
            verifier.update(indices[idx],
                            opening_vectors[idx].coefficients,
                            opening_vectors[idx].evaluations,
                            inverse_vanishing_evals[1]);
            is_kappa_inv_claim = !is_kappa_inv_claim;
        } else {
            verifier.update(indices[idx],
                            opening_vectors[idx].coefficients,
                            opening_vectors[idx].evaluations,
                            inverse_vanishing_evals[0]);
            is_kappa_inv_claim = !is_kappa_inv_claim && (idx >= NUM_WIRES);
        }
    }

    // Export batched claim
    auto batch_opening_claim = verifier.export_batch_opening_claim(Commitment::one(kappa.get_context()));

    // KZG verifier
    auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, transcript);

    // Set T_commitments of the verifier
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_commitments[idx] = commitments[idx + 2 * NUM_WIRES];
    }

    return { pairing_points[0], pairing_points[1] };
}

template class MergeRecursiveVerifier_<MegaCircuitBuilder>;
template class MergeRecursiveVerifier_<UltraCircuitBuilder>;

} // namespace bb::stdlib::recursion::goblin
