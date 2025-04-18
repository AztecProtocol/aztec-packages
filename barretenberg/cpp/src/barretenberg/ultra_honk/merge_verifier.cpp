#include "merge_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"

namespace bb {

MergeVerifier::MergeVerifier()
    : transcript(std::make_shared<Transcript>()){};

/**
 * @brief Verify proper construction of the aggregate Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
 * @details Let T_j be the jth column of the aggregate ecc op table after prepending the subtable columns t_j containing
 * the contribution from a single circuit. T_{j,prev} corresponds to the columns of the aggregate table at the
 * previous stage. For each column we have the relationship T_j = t_j + right_shift(T_{j,prev}, k), where k is the
 * length of the subtable columns t_j. This protocol demonstrates, assuming the length of t is at most k, that the
 * aggregate ecc op table has been constructed correctly via the simple Schwartz-Zippel check:
 *
 *      T_j(\kappa) = t_j(\kappa) + \kappa^k * (T_{j,prev}(\kappa)).
 *
 * @tparam Flavor
 * @return bool Verification result
 */
bool MergeVerifier::verify_proof(const HonkProof& proof)
{
    transcript = std::make_shared<Transcript>(proof);

    uint32_t subtable_size = transcript->template receive_from_prover<uint32_t>("subtable_size");

    // Receive table column polynomial commitments [t_j], [T_{j,prev}], and [T_j], j = 1,2,3,4
    std::array<Commitment, NUM_WIRES> t_commitments;
    std::array<Commitment, NUM_WIRES> T_prev_commitments;
    std::array<Commitment, NUM_WIRES> T_commitments;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        std::string suffix = std::to_string(idx);
        t_commitments[idx] = transcript->template receive_from_prover<Commitment>("t_CURRENT_" + suffix);
        T_prev_commitments[idx] = transcript->template receive_from_prover<Commitment>("T_PREV_" + suffix);
        T_commitments[idx] = transcript->template receive_from_prover<Commitment>("T_CURRENT_" + suffix);
    }

    FF kappa = transcript->template get_challenge<FF>("kappa");

    // Receive evaluations t_j(\kappa), T_{j,prev}(\kappa), T_j(\kappa), j = 1,2,3,4
    std::array<FF, NUM_WIRES> t_evals;
    std::array<FF, NUM_WIRES> T_prev_evals;
    std::array<FF, NUM_WIRES> T_evals;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        t_evals[idx] = transcript->template receive_from_prover<FF>("t_eval_" + std::to_string(idx));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_prev_evals[idx] = transcript->template receive_from_prover<FF>("T_prev_eval_" + std::to_string(idx));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_evals[idx] = transcript->template receive_from_prover<FF>("T_eval_" + std::to_string(idx));
    }

    // Check the identity T_j(\kappa) = t_j(\kappa) + \kappa^m * T_{j,prev}(\kappa). If it fails, return false
    bool identity_checked = true;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        FF T_prev_shifted_eval_reconstructed = T_prev_evals[idx] * kappa.pow(subtable_size);
        bool current_check = T_evals[idx] == t_evals[idx] + T_prev_shifted_eval_reconstructed;
        identity_checked = identity_checked && current_check;
    }

    FF alpha = transcript->template get_challenge<FF>("alpha");

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

    auto pairing_points = PCS::reduce_verify(batched_claim, transcript);
    VerifierCommitmentKey pcs_vkey{};
    auto verified = pcs_vkey.pairing_check(pairing_points[0], pairing_points[1]);
    return identity_checked && verified;
}
} // namespace bb
