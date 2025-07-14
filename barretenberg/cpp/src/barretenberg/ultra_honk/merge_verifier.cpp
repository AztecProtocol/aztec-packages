// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "merge_verifier.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

MergeVerifier::MergeVerifier(const std::shared_ptr<Transcript>& transcript, MergeSettings settings)
    : transcript(transcript)
    , settings(settings){};

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
 * @param t_commitments The commitments to t_j read from the transcript by the PG verifier with which the Merge verifier
 * shares a transcript
 * @return bool Verification result
 */
bool MergeVerifier::verify_proof(const HonkProof& proof, const RefArray<Commitment, NUM_WIRES>& t_commitments)
{
    transcript->load_proof(proof);

    const uint32_t shift_size = transcript->template receive_from_prover<uint32_t>("shift_size");

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
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        t_evals[idx] = transcript->template receive_from_prover<FF>("t_eval_" + std::to_string(idx));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_prev_evals[idx] = transcript->template receive_from_prover<FF>("T_prev_eval_" + std::to_string(idx));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        T_evals[idx] = transcript->template receive_from_prover<FF>("T_eval_" + std::to_string(idx));
    }

    // Check the identity according to whether the current subtable is prepended or appended. If it fails, return false
    bool identity_checked = true;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        bool current_check = false;
        if (settings == MergeSettings::PREPEND) {
            // In prepend mode we shift the evaluation of the previous table and check the identity
            // T_j(\kappa) = t_j(\kappa) + \kappa^m * T_{j,prev}(\kappa)
            FF T_prev_shifted_eval = T_prev_evals[idx] * kappa.pow(shift_size);
            current_check = T_evals[idx] == t_evals[idx] + T_prev_shifted_eval;
        } else {
            // In append mode we shift the evaluation of the new subtable and check the identity
            // T_j(\kappa) =  T_{j,prev}(\kappa) + \kappa^m * t_j(\kappa)
            FF t_shifted_eval = t_evals[idx] * kappa.pow(shift_size);
            current_check = T_evals[idx] == T_prev_evals[idx] + t_shifted_eval;
        }
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
