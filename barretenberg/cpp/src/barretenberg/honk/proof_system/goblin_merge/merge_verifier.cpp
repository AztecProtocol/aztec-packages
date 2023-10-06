#include "merge_verifier.hpp"

namespace proof_system::honk {

template <typename Flavor>
MergeVerifier_<Flavor>::MergeVerifier_(std::unique_ptr<VerifierCommitmentKey> verification_key)
    : pcs_verification_key(std::move(verification_key)){};

template <typename Flavor> bool MergeVerifier_<Flavor>::verify_proof(const plonk::proof& proof)
{
    transcript = VerifierTranscript<FF>{ proof.proof_data };

    // Receive commitments [t_i^{shift}], [T_{i-1}], and [T_i]
    std::array<Commitment, Flavor::NUM_WIRES> C_T_prev;
    std::array<Commitment, Flavor::NUM_WIRES> C_t_shift;
    std::array<Commitment, Flavor::NUM_WIRES> C_T_current;
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        C_T_prev[idx] = transcript.template receive_from_prover<Commitment>("T_PREV_" + std::to_string(idx + 1));
        C_t_shift[idx] = transcript.template receive_from_prover<Commitment>("t_SHIFT_" + std::to_string(idx + 1));
        C_T_current[idx] = transcript.template receive_from_prover<Commitment>("T_CURRENT_" + std::to_string(idx + 1));
    }

    // Receive transcript poly evaluations
    FF kappa = transcript.get_challenge("kappa");

    std::array<FF, Flavor::NUM_WIRES> T_prev_evals;
    std::array<FF, Flavor::NUM_WIRES> t_shift_evals;
    std::array<FF, Flavor::NUM_WIRES> T_current_evals;
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        T_prev_evals[idx] = transcript.template receive_from_prover<FF>("T_prev_eval_" + std::to_string(idx + 1));
        t_shift_evals[idx] = transcript.template receive_from_prover<FF>("t_shift_eval_" + std::to_string(idx + 1));
        T_current_evals[idx] = transcript.template receive_from_prover<FF>("T_current_eval_" + std::to_string(idx + 1));

        // Check the identity T_i(\kappa) = T_{i-1}(\kappa) + t_i^{shift}(\kappa). If it fails, return false
        if (T_current_evals[idx] != T_prev_evals[idx] + t_shift_evals[idx]) {
            return false;
        }
    }

    // Add corresponding univariate opening claims {(\kappa, p(\kappa), [p(X)]}
    std::vector<OpeningClaim> opening_claims;
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        opening_claims.emplace_back(pcs::OpeningClaim<Curve>{ { kappa, T_prev_evals[idx] }, C_T_prev[idx] });
    }
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        opening_claims.emplace_back(pcs::OpeningClaim<Curve>{ { kappa, t_shift_evals[idx] }, C_t_shift[idx] });
    }
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        opening_claims.emplace_back(pcs::OpeningClaim<Curve>{ { kappa, T_current_evals[idx] }, C_T_current[idx] });
    }

    auto alpha = transcript.get_challenge("alpha");

    // Constuct batched commitment and evaluation from constituents
    auto batched_commitment = opening_claims[0].commitment;
    auto batched_eval = opening_claims[0].opening_pair.evaluation;
    auto alpha_pow = alpha;
    for (size_t idx = 1; idx < opening_claims.size(); ++idx) {
        auto& claim = opening_claims[idx];
        batched_commitment = batched_commitment + (claim.commitment * alpha_pow);
        batched_eval += alpha_pow * claim.opening_pair.evaluation;
        alpha_pow *= alpha;
    }

    OpeningClaim batched_claim = { { kappa, batched_eval }, batched_commitment };

    auto verified = PCS::verify(pcs_verification_key, batched_claim, transcript);

    // transcript.print();

    return verified;
}

template class MergeVerifier_<honk::flavor::Ultra>;
template class MergeVerifier_<honk::flavor::UltraGrumpkin>;
template class MergeVerifier_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk