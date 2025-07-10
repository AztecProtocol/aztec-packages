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

template <typename CircuitBuilder>
std::vector<typename MergeRecursiveVerifier_<CircuitBuilder>::Commitment> MergeRecursiveVerifier_<
    CircuitBuilder>::MergeRecursiveVerifier_::preamble_round(const RefArray<Commitment, NUM_WIRES>& t_commitments)
{
    // Commitments used by the Shplonk verifier
    std::vector<Commitment> table_commitments;
    table_commitments.reserve(NUM_MERGE_COMMITMENTS);

    // [t_j]
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(t_commitments[idx]);
    }

    // Receive [T_{j,prev}], [T_j], [g_j]
    std::array<std::string, 3> labels{ "T_PREV_", "T_", "REVERSED_t_" };
    for (auto& label : labels) {
        for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
            std::string suffix = std::to_string(wire_idx);
            table_commitments.emplace_back(transcript->template receive_from_prover<Commitment>(label + suffix));
        }
    }

    return table_commitments;
};

template <typename CircuitBuilder>
std::vector<typename MergeRecursiveVerifier_<CircuitBuilder>::Claims> MergeRecursiveVerifier_<
    CircuitBuilder>::construct_opening_claims(const FF& kappa, const FF& kappa_inv, const FF& pow_kappa)
{
    std::vector<Claims> opening_claims;
    opening_claims.reserve(NUM_MERGE_CLAIMS);

    // Add opening claim for t_j(1/kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF t_eval_kappa_inv = transcript->template receive_from_prover<FF>("t_evals_kappa_inv_" + std::to_string(idx));
        Claims claim{ { idx + t_IDX * NUM_WIRES }, { FF(1) }, { kappa_inv, t_eval_kappa_inv } };
        opening_claims.emplace_back(claim);
    }
    // Add opening claim for t_j(kappa) + kappa^l T_{j,prev}(kappa) - T_j(kappa) = 0
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Evaluation is hard-coded to zero
        Claims claim{ { idx + t_IDX * NUM_WIRES, idx + T_PREV_IDX * NUM_WIRES, idx + T_IDX * NUM_WIRES },
                      { FF(1), pow_kappa, FF(-1) },
                      { kappa, FF(0) } };
        opening_claims.emplace_back(claim);
    }
    // Add opening claim for g_j(kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF reversed_t_eval = transcript->template receive_from_prover<FF>("reversed_t_eval_" + std::to_string(idx));
        Claims claim{ { idx + REVERSED_t_IDX * NUM_WIRES }, { FF(1) }, { kappa, reversed_t_eval } };
        opening_claims.emplace_back(claim);
    }

    return opening_claims;
};

template <typename CircuitBuilder>
void MergeRecursiveVerifier_<CircuitBuilder>::degree_check(const std::vector<Claims>& opening_claims,
                                                           const FF& pow_kappa_minus_one)
{
    // Indices in the `opening_claims` vector
    static constexpr size_t REVERSED_t_EVAL_IDX = REVERSED_t_IDX - 1;
    static constexpr size_t t_EVAL_IDX = t_IDX;

    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF reversed_t_eval = opening_claims[idx + REVERSED_t_EVAL_IDX * NUM_WIRES].opening_pair.evaluation;
        FF t_eval_kappa_inv = opening_claims[idx + t_EVAL_IDX * NUM_WIRES].opening_pair.evaluation;

        // Check t_j(1/kappa) * kappa^{l-1} == g_j(kappa)
        reversed_t_eval.assert_equal(t_eval_kappa_inv * pow_kappa_minus_one);
    }
}

template <typename CircuitBuilder>
MergeRecursiveVerifier_<CircuitBuilder>::PairingPoints MergeRecursiveVerifier_<CircuitBuilder>::verify_claims(
    std::vector<Commitment>& table_commitments, const std::vector<Claims>& opening_claims, const FF& kappa)
{
    // Initialize Shplonk verifier
    ShplonkVerifier verifier(table_commitments, transcript, NUM_MERGE_CLAIMS);
    verifier.reduce_verification_vector_claims_no_finalize(opening_claims);

    // Export batched claim
    auto batch_opening_claim = verifier.export_batch_opening_claim(Commitment::one(kappa.get_context()));

    // KZG verifier
    return KZG::reduce_verify_batch_opening_claim(batch_opening_claim, transcript);
}

/**
 * @brief Computes inputs to a pairing check that, if verified, establishes proper construction of the aggregate
 * Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
 * @details Let T_j be the jth column of the aggregate ecc op table after prepending the subtable columns t_j
 * containing the contribution from a single circuit. T_{j,prev} corresponds to the columns of the aggregate
 * table at the previous stage. For each column we have the relationship T_j = t_j + right_shift(T_{j,prev}, k),
 * where k is the length of the subtable columns t_j. This protocol demonstrates that the aggregate ecc op table
 * has been constructed correctly via:
 * - the Schwartz-Zippel check:
 *      \f[ T_j(\kappa) = t_j(\kappa) + \kappa^k * (T_{j,prev}(\kappa)) \f]
 * - the degree check a la Thakur:
 *      \f[ x^{l-1} t_j(1/x) = g_j(x) \f]
 *   where \f$g_j(X) = X^{l-1} t_j(1 / X)\f$.
 *
 * @tparam CircuitBuilder
 * @param proof
 * @param t_commitments The commitments to t_j read from the transcript by the PG recursive verifier with which
 * the Merge recursive verifier shares a transcript
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
     * Shplonk verification checks the following openings: t_j(1/kappa), p_j(kappa), g_j(kappa)
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

    FF subtable_size = transcript->template receive_from_prover<FF>("subtable_size");

    auto table_commitments = preamble_round(t_commitments);

    // Store T_commitments of the verifier
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_commitments[idx] = table_commitments[idx + T_IDX * NUM_WIRES];
    }

    // Evaluation challenge
    FF kappa = transcript->template get_challenge<FF>("kappa");
    FF kappa_inv = kappa.invert();
    FF pow_kappa_minus_one = kappa.pow(subtable_size - 1);
    FF pow_kappa = pow_kappa_minus_one * kappa;

    auto opening_claims = construct_opening_claims(kappa, kappa_inv, pow_kappa);

    // Verify the claims
    auto pairing_points = verify_claims(table_commitments, opening_claims, kappa);

    // Perform degree check
    degree_check(opening_claims, pow_kappa_minus_one);

    return pairing_points;
}

template class MergeRecursiveVerifier_<MegaCircuitBuilder>;
template class MergeRecursiveVerifier_<UltraCircuitBuilder>;

} // namespace bb::stdlib::recursion::goblin
