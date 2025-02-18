#include "barretenberg/stdlib/goblin_verifier/merge_recursive_verifier.hpp"

namespace bb::stdlib::recursion::goblin {

template <typename CircuitBuilder>
MergeRecursiveVerifier_<CircuitBuilder>::MergeRecursiveVerifier_(CircuitBuilder* builder)
    : builder(builder)
{}

/**
 * @brief Construct recursive verifier for Goblin Merge protocol, up to but not including the pairing
 *
 * @tparam Flavor
 * @param proof
 * @return std::array<typename Flavor::GroupElement, 2> Inputs to final pairing
 */
template <typename CircuitBuilder>
std::array<typename bn254<CircuitBuilder>::Element, 2> MergeRecursiveVerifier_<CircuitBuilder>::verify_proof(
    const HonkProof& proof)
{
    // transform it into stdlib proof
    StdlibProof<CircuitBuilder> stdlib_proof = bb::convert_native_proof_to_stdlib(builder, proof);
    transcript = std::make_shared<Transcript>(stdlib_proof);

    FF subtable_size = transcript->template receive_from_prover<FF>("subtable_size");

    // Receive commitments [t], [T_prev], and [T]
    std::array<Commitment, NUM_WIRES> C_t;
    std::array<Commitment, NUM_WIRES> C_T_prev;
    std::array<Commitment, NUM_WIRES> C_T;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        C_t[idx] = transcript->template receive_from_prover<Commitment>("t_CURRENT_" + std::to_string(idx + 1));
        C_T_prev[idx] = transcript->template receive_from_prover<Commitment>("T_PREV_" + std::to_string(idx + 1));
        C_T[idx] = transcript->template receive_from_prover<Commitment>("T_CURRENT_" + std::to_string(idx + 1));
    }

    FF kappa = transcript->template get_challenge<FF>("kappa");

    // Receive transcript poly evaluations and add corresponding univariate opening claims {(\kappa, p(\kappa), [p(X)]}
    std::array<FF, NUM_WIRES> t_evals;
    std::array<FF, NUM_WIRES> T_prev_evals;
    std::array<FF, NUM_WIRES> T_current_evals;
    std::vector<OpeningClaim> opening_claims;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        t_evals[idx] = transcript->template receive_from_prover<FF>("t_eval_" + std::to_string(idx + 1));
        opening_claims.emplace_back(OpeningClaim{ { kappa, t_evals[idx] }, C_t[idx] });
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_prev_evals[idx] = transcript->template receive_from_prover<FF>("T_prev_eval_" + std::to_string(idx + 1));
        opening_claims.emplace_back(OpeningClaim{ { kappa, T_prev_evals[idx] }, C_T_prev[idx] });
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_current_evals[idx] =
            transcript->template receive_from_prover<FF>("T_current_eval_" + std::to_string(idx + 1));
        opening_claims.emplace_back(OpeningClaim{ { kappa, T_current_evals[idx] }, C_T[idx] });
    }

    // Check the identity T(\kappa) = t(\kappa) + \kappa^m * T_prev(\kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF T_prev_shifted_eval_reconstructed = T_prev_evals[idx] * kappa.pow(subtable_size);
        T_current_evals[idx].assert_equal(t_evals[idx] + T_prev_shifted_eval_reconstructed);
    }

    FF alpha = transcript->template get_challenge<FF>("alpha");

    // Constuct batched commitment and batched evaluation from constituents using batching challenge \alpha
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
        alpha_pow *= alpha;
    }

    auto batched_commitment = Commitment::batch_mul(commitments, scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);

    OpeningClaim batched_claim = { { kappa, batched_eval }, batched_commitment };

    auto pairing_points = KZG::reduce_verify(batched_claim, transcript);

    return pairing_points;
}

template class MergeRecursiveVerifier_<MegaCircuitBuilder>;
template class MergeRecursiveVerifier_<UltraCircuitBuilder>;

} // namespace bb::stdlib::recursion::goblin
