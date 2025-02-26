#include "merge_prover.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"

namespace bb {

/**
 * @brief Create MergeProver
 * @details We require an SRS at least as large as the current ultra ecc ops table
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1267): consider possible efficiency improvements
 */
template <class Flavor>
MergeProver_<Flavor>::MergeProver_(const std::shared_ptr<ECCOpQueue>& op_queue,
                                   std::shared_ptr<CommitmentKey> commitment_key)
    : op_queue(op_queue)
{
    // Update internal size data in the op queue that allows for extraction of e.g. previous aggregate transcript
    pcs_commitment_key =
        commitment_key ? commitment_key : std::make_shared<CommitmentKey>(op_queue->get_ultra_ops_table_num_rows());
}

/**
 * @brief Prove proper construction of the aggregate Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
 * @details Let T_j be the jth column of the aggregate ecc op table after prepending the subtable columns t_j containing
 * the contribution from the present circuit. T_{j,prev} corresponds to the columns of the aggregate table at the
 * previous stage. For each column we have the relationship T_j = t_j + right_shift(T_{j,prev}, k), where k is the
 * length of the subtable columns t_j. This protocol demonstrates, assuming the length of t is at most k, that the
 * aggregate ecc op table has been constructed correctly via the simple Schwartz-Zippel check:
 *
 *      T_j(\kappa) = t_j(\kappa) + \kappa^k * (T_{j,prev}(\kappa)).
 *
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1270): connect [t_j] used herein those used in PG verifier
 *
 * @return honk::proof
 */
template <typename Flavor> HonkProof MergeProver_<Flavor>::construct_proof()
{
    transcript = std::make_shared<Transcript>();

    // Extract columns of the full table T_j, the previous table T_{j,prev}, and the current subtable t_j
    std::array<Polynomial, NUM_WIRES> T_current = op_queue->construct_ultra_ops_table_columns();
    std::array<Polynomial, NUM_WIRES> T_prev = op_queue->construct_previous_ultra_ops_table_columns();
    std::array<Polynomial, NUM_WIRES> t_current = op_queue->construct_current_ultra_ops_subtable_columns();

    // TODO(#723): Cannot currently support an empty T_prev. Need to be able to properly handle zero commitment.
    ASSERT(T_prev[0].size() > 0);
    ASSERT(T_current[0].size() > T_prev[0].size()); // Must have some new ops to accumulate otherwise [t_j] = 0

    const size_t current_table_size = T_current[0].size();
    const size_t current_subtable_size = t_current[0].size();

    transcript->send_to_verifier("subtable_size", static_cast<uint32_t>(current_subtable_size));

    // Compute/get commitments [t^{shift}], [T_prev], and [T] and add to transcript
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        // Compute commitments
        Commitment t_commitment = pcs_commitment_key->commit(t_current[idx]);
        Commitment T_prev_commitment = pcs_commitment_key->commit(T_prev[idx]);
        Commitment T_commitment = pcs_commitment_key->commit(T_current[idx]);

        std::string suffix = std::to_string(idx);
        transcript->send_to_verifier("t_CURRENT_" + suffix, t_commitment);
        transcript->send_to_verifier("T_PREV_" + suffix, T_prev_commitment);
        transcript->send_to_verifier("T_CURRENT_" + suffix, T_commitment);
    }

    // Compute evaluations T_j(\kappa), T_{j,prev}(\kappa), t_j(\kappa), add to transcript. For each polynomial we add a
    // univariate opening claim {p(X), (\kappa, p(\kappa))} to the set of claims to be checked via batched KZG.
    FF kappa = transcript->template get_challenge<FF>("kappa");

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

    // Construct batched polynomial to be opened via KZG
    Polynomial batched_polynomial(current_table_size);
    FF batched_eval(0);
    FF alpha_pow(1);
    for (auto& claim : opening_claims) {
        batched_polynomial.add_scaled(claim.polynomial, alpha_pow);
        batched_eval += alpha_pow * claim.opening_pair.evaluation;
        alpha_pow *= alpha;
    }

    // Construct and commit to KZG quotient polynomial q = (f - v) / (X - kappa)
    OpeningClaim batched_claim = { std::move(batched_polynomial), { kappa, batched_eval } };
    PCS::compute_opening_proof(pcs_commitment_key, batched_claim, transcript);

    return transcript->proof_data;
}

template class MergeProver_<UltraFlavor>;
template class MergeProver_<MegaFlavor>;
template class MergeProver_<MegaZKFlavor>;

} // namespace bb
