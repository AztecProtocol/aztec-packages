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
 * length of the subtable columns t_j. This protocol demonstrates, assuming the length of t is at most k, that the
 * aggregate ecc op table has been constructed correctly via the simple Schwartz-Zippel check:
 *
 *      T_j(\kappa) = t_j(\kappa) + \kappa^k * (T_{j,prev}(\kappa)).
 *
 * @tparam CircuitBuilder
 * @param proof
 * @param t_commitments The commitments to t_j read from the transcript by the PG recursive verifier with which the
 * Merge recursive verifier shares a transcript
 * @return std::array<typename Flavor::GroupElement, 2> Inputs to final pairing
 */
template <typename CircuitBuilder>
MergeRecursiveVerifier_<CircuitBuilder>::PairingPoints MergeRecursiveVerifier_<CircuitBuilder>::verify_proof(
    const StdlibProof<CircuitBuilder>& proof, const RefArray<Commitment, NUM_WIRES> t_commitments)
{
    // Transform proof into a stdlib object
    transcript->load_proof(proof);

    FF subtable_size = transcript->template receive_from_prover<FF>("subtable_size");

    // Receive table column polynomial commitments [T_{j,prev}], and [T_j], j = 1,2,3,4
    std::array<Commitment, NUM_WIRES> T_prev_commitments;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        std::string suffix = std::to_string(idx);
        T_prev_commitments[idx] = transcript->template receive_from_prover<Commitment>("T_PREV_" + suffix);
        T_commitments[idx] = transcript->template receive_from_prover<Commitment>("T_CURRENT_" + suffix);
    }

    FF kappa = transcript->template get_challenge<FF>("kappa");

    // Receive evaluations t_j(\kappa), T_{j,prev}(\kappa), T_j(\kappa), j = 1,2,3,4
    std::array<FF, NUM_WIRES> t_evals;
    std::array<FF, NUM_WIRES> T_prev_evals;
    std::array<FF, NUM_WIRES> T_evals;
    std::vector<OpeningClaim> opening_claims;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        t_evals[idx] = transcript->template receive_from_prover<FF>("t_eval_" + std::to_string(idx + 1));
        opening_claims.emplace_back(OpeningClaim{ { kappa, t_evals[idx] }, t_commitments[idx] });
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_prev_evals[idx] = transcript->template receive_from_prover<FF>("T_prev_eval_" + std::to_string(idx + 1));
        opening_claims.emplace_back(OpeningClaim{ { kappa, T_prev_evals[idx] }, T_prev_commitments[idx] });
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_evals[idx] = transcript->template receive_from_prover<FF>("T_eval_" + std::to_string(idx + 1));
        opening_claims.emplace_back(OpeningClaim{ { kappa, T_evals[idx] }, T_commitments[idx] });
    }

    // Check the identity T_j(\kappa) = t_j(\kappa) + \kappa^m * T_{j,prev}(\kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF T_prev_shifted_eval_reconstructed = T_prev_evals[idx] * kappa.pow(subtable_size);
        T_evals[idx].assert_equal(t_evals[idx] + T_prev_shifted_eval_reconstructed);
    }

    FF alpha = transcript->template get_challenge<FF>("alpha");

    // Constuct inputs to batched commitment and batched evaluation from constituents using batching challenge \alpha
    std::vector<FF> scalars;
    std::vector<Commitment> commitments;
    scalars.emplace_back(FF(builder, 1));
    commitments.emplace_back(opening_claims[0].commitment);
    auto batched_eval = opening_claims[0].opening_pair.evaluation;
    auto alpha_pow = alpha;
    for (size_t idx = 1; idx < opening_claims.size(); ++idx) {
        auto& claim = opening_claims[idx];
        scalars.emplace_back(alpha_pow);
        commitments.emplace_back(claim.commitment);
        batched_eval += alpha_pow * claim.opening_pair.evaluation;
        if (idx < opening_claims.size() - 1) {
            alpha_pow *= alpha;
        }
    }

    auto batched_commitment = Commitment::batch_mul(commitments, scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

    OpeningClaim batched_claim = { { kappa, batched_eval }, batched_commitment };

    auto pairing_points = KZG::reduce_verify(batched_claim, transcript);

    return { pairing_points[0], pairing_points[1] };
}

template class MergeRecursiveVerifier_<MegaCircuitBuilder>;
template class MergeRecursiveVerifier_<UltraCircuitBuilder>;

} // namespace bb::stdlib::recursion::goblin
