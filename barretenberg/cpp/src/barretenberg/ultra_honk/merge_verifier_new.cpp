#include "merge_verifier_new.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"

namespace bb {

template <typename Flavor>
MergeVerifierNew_<Flavor>::MergeVerifierNew_()
    : transcript(std::make_shared<Transcript>())
    , pcs_verification_key(std::make_unique<VerifierCommitmentKey>()){};

/**
 * @brief Verify proper construction of the aggregate Goblin ECC op queue polynomials T_i^(j), j = 1,2,3,4.
 * @details Let T_i^(j) be the jth column of the aggregate op queue after incorporating the contribution from the
 * present circuit. T_{i-1}^(j) corresponds to the aggregate op queue at the previous stage and $t_i^(j)$ represents
 * the contribution from the present circuit only. For each j, we have the relationship T_i = T_{i-1} + right_shift(t_i,
 * M_{i-1}), where the shift magnitude M_{i-1} is the honest length of T_{i-1}. This protocol verfies, assuming the
 * length of T_{i-1} is at most M_{i-1}, that the aggregate op queue has been constructed correctly via a simple
 * Schwartz-Zippel check. Evaluations are checked via batched KZG.
 *
 * @tparam Flavor
 * @return bool
 */
template <typename Flavor> bool MergeVerifierNew_<Flavor>::verify_proof(const HonkProof& proof)
{
    transcript = std::make_shared<Transcript>(proof);

    uint32_t subtable_size = transcript->template receive_from_prover<uint32_t>("subtable_size");
    info("subtable_size: ", subtable_size);

    // Receive commitments [t_i^{shift}], [T_{i-1}], and [T_i]
    std::array<Commitment, Flavor::NUM_WIRES> t_commitments;
    std::array<Commitment, Flavor::NUM_WIRES> T_prev_commitments;
    std::array<Commitment, Flavor::NUM_WIRES> T_commitments;
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        std::string suffix = std::to_string(idx);
        t_commitments[idx] = transcript->template receive_from_prover<Commitment>("t_CURRENT_" + suffix);
        T_prev_commitments[idx] = transcript->template receive_from_prover<Commitment>("T_PREV_" + suffix);
        T_commitments[idx] = transcript->template receive_from_prover<Commitment>("T_CURRENT_" + suffix);
    }

    FF kappa = transcript->template get_challenge<FF>("kappa");
    info("kappa: ", kappa);

    // Receive transcript poly evaluations and add corresponding univariate opening claims {(\kappa, p(\kappa), [p(X)]}
    std::array<FF, Flavor::NUM_WIRES> t_evals;
    std::array<FF, Flavor::NUM_WIRES> T_prev_evals;
    std::array<FF, Flavor::NUM_WIRES> T_evals;
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        t_evals[idx] = transcript->template receive_from_prover<FF>("t_eval_" + std::to_string(idx));
    }
    for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
        T_prev_evals[idx] = transcript->template receive_from_prover<FF>("T_prev_eval_" + std::to_string(idx));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_evals[idx] = transcript->template receive_from_prover<FF>("T_eval_" + std::to_string(idx));
    }

    // Check the identity T(\kappa) = t(\kappa) + \kappa^m * T_prev_(\kappa). If it fails, return false
    bool identity_checked = true;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF T_prev_shifted_eval_reconstructed = T_prev_evals[idx] * kappa.pow(subtable_size);
        bool current_check = T_evals[idx] == t_evals[idx] + T_prev_shifted_eval_reconstructed;
        info("current_check: ", current_check);
        identity_checked = identity_checked && current_check;
    }

    FF alpha = transcript->template get_challenge<FF>("alpha");
    info("alpha: ", alpha);

    // Construct batched commitment and evaluation from constituents
    Commitment batched_commitment = t_commitments[0];
    FF batched_eval = t_evals[0];
    auto alpha_pow = alpha;
    for (size_t idx = 1; idx < NUM_WIRES; ++idx) {
        batched_commitment = batched_commitment + (t_commitments[idx] * alpha_pow);
        batched_eval += alpha_pow * t_evals[idx];
        alpha_pow *= alpha;
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        batched_commitment = batched_commitment + (T_prev_commitments[idx] * alpha_pow);
        batched_eval += alpha_pow * T_prev_evals[idx];
        alpha_pow *= alpha;
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        batched_commitment = batched_commitment + (T_commitments[idx] * alpha_pow);
        batched_eval += alpha_pow * T_evals[idx];
        alpha_pow *= alpha;
    }

    OpeningClaim batched_claim = { { kappa, batched_eval }, batched_commitment };

    info("Verifier: batched_eval: ", batched_eval);
    info("batched_commitment: ", batched_commitment);

    auto pairing_points = PCS::reduce_verify(batched_claim, transcript);
    auto verified = pcs_verification_key->pairing_check(pairing_points[0], pairing_points[1]);
    return identity_checked && verified;
}

template class MergeVerifierNew_<UltraFlavor>;
template class MergeVerifierNew_<MegaFlavor>;
template class MergeVerifierNew_<MegaZKFlavor>;

} // namespace bb
