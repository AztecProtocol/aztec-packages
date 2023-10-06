#include "merge_prover.hpp"

namespace proof_system::honk {

/**
 * Create MergeProver_
 *
 */
template <typename Flavor>
MergeProver_<Flavor>::MergeProver_(std::shared_ptr<CommitmentKey> commitment_key, std::shared_ptr<ECCOpQueue> op_queue)
    : op_queue(op_queue)
    , pcs_commitment_key(commitment_key)
{}

/**
 * @brief Prove proper construction of the aggregate Goblin ECC op queue polynomials T_i^(j), j = 1,2,3,4.
 * @details Let T_i^(j) be the jth column of the aggregate op queue after incorporating the contribution from the
 * present circuit. T_{i-1}^(j) corresponds to the aggregate op queue at the previous stage and $t_i^(j)$ represents
 * the contribution from the present circuit only. For each j, we have the relationship T_i = T_{i-1} + right_shift(t_i,
 * M_{i-1}), where the shift magnitude M_{i-1} is the length of T_{i-1}. This stage of the protocol demonstrates that
 * the aggregate op queue has been constructed correctly.
 *
 * @tparam Flavor
 * @return plonk::proof&
 */
template <typename Flavor> plonk::proof& MergeProver_<Flavor>::construct_proof()
{
    size_t N = op_queue->get_current_size();

    // Extract T_i
    auto T_current = op_queue->get_aggregate_transcript();
    auto T_prev = op_queue->get_previous_aggregate_transcript();
    // Extract size M_{i-1} of T_{i-1} from op_queue
    size_t prev_op_queue_size = op_queue->get_previous_size(); // M_{i-1}
    // TODO(#723): Cannot currently support an empty T_{i-1}. Need to be able to properly handle zero commitment.
    ASSERT(prev_op_queue_size > 0);
    // Construct t_i^{shift} as T_i - T_{i-1}
    std::array<Polynomial, Flavor::NUM_WIRES> t_shift;
    for (size_t i = 0; i < Flavor::NUM_WIRES; ++i) {
        t_shift[i] = Polynomial(T_current[i]);
        t_shift[i] -= T_prev[i];
    }

    // Compute/get commitments [t_i^{shift}], [T_{i-1}], and [T_i] and add to transcript
    std::array<Commitment, Flavor::NUM_WIRES> C_T_prev;
    std::array<Commitment, Flavor::NUM_WIRES> C_t_shift;
    std::array<Commitment, Flavor::NUM_WIRES> C_T_current;
    for (size_t idx = 0; idx < t_shift.size(); ++idx) {
        // Get previous transcript commitment [T_{i-1}] from op queue
        C_T_prev[idx] = op_queue->ultra_ops_commitments[idx];
        // Compute commitment [t_i^{shift}] directly
        C_t_shift[idx] = pcs_commitment_key->commit(t_shift[idx]);
        // Compute updated aggregate transcript commitmen as [T_i] = [T_{i-1}] + [t_i^{shift}]
        C_T_current[idx] = C_T_prev[idx] + C_t_shift[idx];

        std::string suffix = std::to_string(idx + 1);
        transcript.send_to_verifier("T_PREV_" + suffix, C_T_prev[idx]);
        transcript.send_to_verifier("t_SHIFT_" + suffix, C_t_shift[idx]);
        transcript.send_to_verifier("T_CURRENT_" + suffix, C_T_current[idx]);
    }

    // Store the commitments [T_{i}] (to be used later in subsequent iterations as [T_{i-1}]).
    op_queue->set_commitment_data(C_T_current);

    // Compute evaluations T_i(\kappa), T_{i-1}(\kappa), t_i^{shift}(\kappa), add to transcript. For each polynomial
    // we add a univariate opening claim {p(X), (\kappa, p(\kappa))} to the set of claims to be checked via batched KZG.
    auto kappa = transcript.get_challenge("kappa");

    std::array<FF, Flavor::NUM_WIRES> T_prev_evals;
    std::array<FF, Flavor::NUM_WIRES> t_shift_evals;
    std::array<FF, Flavor::NUM_WIRES> T_current_evals;
    std::array<Polynomial, Flavor::NUM_WIRES> T_prev_polynomials;
    std::array<Polynomial, Flavor::NUM_WIRES> T_current_polynomials;
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        std::string suffix = std::to_string(idx + 1);

        // Compute evaluation T_{i-1}(\kappa)
        T_prev_polynomials[idx] = Polynomial(T_prev[idx]);
        T_prev_evals[idx] = T_prev_polynomials[idx].evaluate(kappa);
        transcript.send_to_verifier("T_prev_eval_" + suffix, T_prev_evals[idx]);

        // Compute evaluation t_i^{shift}(\kappa)
        t_shift_evals[idx] = t_shift[idx].evaluate(kappa);
        transcript.send_to_verifier("t_shift_eval_" + suffix, t_shift_evals[idx]);

        // Compute evaluation T_i(\kappa)
        T_current_polynomials[idx] = Polynomial(T_current[idx]);
        T_current_evals[idx] = T_current_polynomials[idx].evaluate(kappa);
        transcript.send_to_verifier("T_current_eval_" + suffix, T_current_evals[idx]);
    }

    // Add univariate opening claims for each polynomial.
    std::vector<OpeningClaim> opening_claims;
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        opening_claims.emplace_back(OpeningClaim{ T_prev_polynomials[idx], { kappa, T_prev_evals[idx] } });
    }
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        opening_claims.emplace_back(OpeningClaim{ t_shift[idx], { kappa, t_shift_evals[idx] } });
    }
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        opening_claims.emplace_back(OpeningClaim{ T_current_polynomials[idx], { kappa, T_current_evals[idx] } });
    }

    auto alpha = transcript.get_challenge("alpha");

    // Constuct batched polynomial to open
    auto batched_polynomial = Polynomial(N);
    auto batched_eval = FF(0);
    auto alpha_pow = FF(1);
    for (auto& claim : opening_claims) {
        batched_polynomial.add_scaled(claim.polynomial, alpha_pow);
        batched_eval += alpha_pow * claim.opening_pair.evaluation;
        alpha_pow *= alpha;
    }

    // Construct quotient q = (f - v) / (X - kappa)
    auto quotient = batched_polynomial;
    quotient[0] -= batched_eval;
    quotient.factor_roots(kappa);

    // Construct batched opening proof W = [quotient]
    auto quotient_commitment = pcs_commitment_key->commit(quotient);
    transcript.send_to_verifier("KZG:W", quotient_commitment);

    proof.proof_data = transcript.proof_data;
    return proof;
}

template class MergeProver_<honk::flavor::Ultra>;
template class MergeProver_<honk::flavor::UltraGrumpkin>;
template class MergeProver_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk