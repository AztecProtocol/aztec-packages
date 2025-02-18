#include "merge_prover_new.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"

namespace bb {

/**
 * @brief Create MergeProver
 * @details We require an SRS at least as large as the current op queue size in order to commit to the shifted
 * per-circuit contribution t^{shift}
 *
 */
template <class Flavor>
MergeProverNew_<Flavor>::MergeProverNew_(const std::shared_ptr<ECCOpQueue>& op_queue,
                                         std::shared_ptr<CommitmentKey> commitment_key)
    : op_queue(op_queue)
{
    // Update internal size data in the op queue that allows for extraction of e.g. previous aggregate transcript
    op_queue->set_size_data();
    pcs_commitment_key =
        commitment_key ? commitment_key : std::make_shared<CommitmentKey>(op_queue->get_current_size());
}

/**
 * @brief Prove proper construction of the aggregate Goblin ECC op queue polynomials T^(j), j = 1,2,3,4.
 * @details Let T^(j) be the jth column of the aggregate op queue after incorporating the contribution from the
 * present circuit. T_prev^(j) corresponds to the aggregate op queue at the previous stage and $t^(j)$ represents
 * the contribution from the present circuit only. For each j, we have the relationship T = T_prev + right_shift(t,
 * M_{i-1}), where the shift magnitude M_{i-1} is the honest length of T_prev. This protocol demonstrates, assuming the
 * length of T_prev is at most M_{i-1}, that the aggregate op queue has been constructed correctly via a simple
 * Schwartz-Zippel check. Evaluations are proven via batched KZG.
 *
 * TODO(#746): Prove connection between t^{shift}, committed to herein, and t, used in the main protocol. See issue
 * for details (https://github.com/AztecProtocol/barretenberg/issues/746).
 *
 * @return honk::proof
 */
template <typename Flavor> HonkProof MergeProverNew_<Flavor>::construct_proof()
{
    transcript = std::make_shared<Transcript>();

    // Extract T, T_prev, t
    std::array<Polynomial, 4> T_current = op_queue->get_ultra_ops_table_columns();
    std::array<Polynomial, 4> T_prev = op_queue->get_previous_ultra_ops_table_columns();
    std::array<Polynomial, 4> t_current = op_queue->get_current_subtable_columns();

    // TODO(#723): Cannot currently support an empty T_prev. Need to be able to properly handle zero commitment.
    ASSERT(T_prev[0].size() > 0);
    ASSERT(T_current[0].size() > T_prev[0].size()); // Must have some new ops to accumulate otherwise C_t_shift = 0

    const size_t current_table_size = T_current[0].size();
    const size_t current_subtable_size = t_current[0].size();

    transcript->send_to_verifier("subtable_size", current_subtable_size);
    info("subtable_size: ", current_subtable_size);

    // Compute/get commitments [t^{shift}], [T_prev], and [T] and add to transcript
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Compute commitments
        Commitment C_t_current = pcs_commitment_key->commit(t_current[idx]);
        Commitment C_T_prev = pcs_commitment_key->commit(T_prev[idx]);
        Commitment C_T_current = pcs_commitment_key->commit(T_current[idx]);

        std::string suffix = std::to_string(idx);
        transcript->send_to_verifier("t_CURRENT_" + suffix, C_t_current);
        transcript->send_to_verifier("T_PREV_" + suffix, C_T_prev);
        transcript->send_to_verifier("T_CURRENT_" + suffix, C_T_current);
    }

    // Compute evaluations T(\kappa), T_prev_shift(\kappa), t(\kappa), add to transcript. For each polynomial we add a
    // univariate opening claim {p(X), (\kappa, p(\kappa))} to the set of claims to be checked via batched KZG.
    FF kappa = transcript->template get_challenge<FF>("kappa");
    info("kappa: ", kappa);

    // Add univariate opening claims for each polynomial.
    std::vector<OpeningClaim> opening_claims;
    // Compute evaluation t(\kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = t_current[idx].evaluate(kappa);
        transcript->send_to_verifier("t_eval_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ std::move(t_current[idx]), { kappa, evaluation } });
    }
    // Compute evaluation T_prev(\kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = T_prev[idx].evaluate(kappa);
        transcript->send_to_verifier("T_prev_eval_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ T_prev[idx], { kappa, evaluation } });
    }
    // Compute evaluation T(\kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF evaluation = T_current[idx].evaluate(kappa);
        transcript->send_to_verifier("T_eval_" + std::to_string(idx), evaluation);
        opening_claims.emplace_back(OpeningClaim{ std::move(T_current[idx]), { kappa, evaluation } });
    }

    FF alpha = transcript->template get_challenge<FF>("alpha");
    info("alpha: ", alpha);

    // Construct batched polynomial to opened via KZG
    Polynomial batched_polynomial(current_table_size);
    FF batched_eval(0);
    FF alpha_pow(1);
    for (auto& claim : opening_claims) {
        batched_polynomial.add_scaled(claim.polynomial, alpha_pow);
        batched_eval += alpha_pow * claim.opening_pair.evaluation;
        alpha_pow *= alpha;
    }

    info("Prover: batched_eval: ", batched_eval);
    info("reconstructed batched_eval: ", batched_polynomial.evaluate(kappa));
    info("batched_commitment: ", pcs_commitment_key->commit(batched_polynomial));

    // Construct and commit to KZG quotient polynomial q = (f - v) / (X - kappa)
    auto quotient = batched_polynomial;
    quotient.at(0) -= batched_eval;
    quotient.factor_roots(kappa);

    auto quotient_commitment = pcs_commitment_key->commit(quotient);
    transcript->send_to_verifier("KZG:W", quotient_commitment);

    return transcript->proof_data;
}

template class MergeProverNew_<UltraFlavor>;
template class MergeProverNew_<MegaFlavor>;
template class MergeProverNew_<MegaZKFlavor>;

} // namespace bb
