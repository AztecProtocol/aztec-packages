// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "merge_verifier.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

MergeVerifier::MergeVerifier(const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript){};

/**
 * @brief Verify proper construction of the aggregate Goblin ECC op queue polynomials T_j, j = 1,2,3,4.
 * @details Let T_j be the jth column of the aggregate ecc op table after prepending the subtable columns t_j containing
 * the contribution from a single circuit. T_{j,prev} corresponds to the columns of the aggregate table at the
 * previous stage. For each column we have the relationship T_j = t_j + right_shift(T_{j,prev}, k), where k is the
 * length of the subtable columns t_j. This protocol demonstrates that the aggregate ecc op table has been
 * constructed correctly via:
 * - the Schwartz-Zippel check:
 *      \f[ T_j(\kappa) = t_j(\kappa) + \kappa^k * (T_{j,prev}(\kappa)) \f]
 * - the degree check a la Thakur:
 *      \f[ x^{l-1} t_j(1/x) = g_j(x) \f]
 *   where \f$g_j(X) = X^{l-1} t_j(1 / X)\f$.
 *
 * @tparam Flavor
 * @param t_commitments The commitments to t_j read from the transcript by the PG verifier with which the Merge verifier
 * shares a transcript
 * @return bool Verification result
 */
bool MergeVerifier::verify_proof(const HonkProof& proof, const RefArray<Commitment, NUM_WIRES>& t_commitments)
{
    transcript->load_proof(proof);

    uint32_t subtable_size = transcript->template receive_from_prover<uint32_t>("subtable_size");

    // Receive table column polynomial commitments [T_{j,prev}], [T_j], [inverted_t_j] j = 1,2,3,4
    std::array<Commitment, NUM_WIRES> T_prev_commitments;
    std::array<Commitment, NUM_WIRES> inverted_t_commitments;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        std::string suffix = std::to_string(idx);
        T_prev_commitments[idx] = transcript->template receive_from_prover<Commitment>("T_PREV_" + suffix);
        T_commitments[idx] = transcript->template receive_from_prover<Commitment>("T_CURRENT_" + suffix);
        inverted_t_commitments[idx] =
            transcript->template receive_from_prover<Commitment>("INVERTED_t_CURRENT_" + suffix);
    }

    // Evaluation challenge
    FF kappa = transcript->template get_challenge<FF>("kappa");
    FF minus_pow_kappa = -kappa.pow(subtable_size);
    FF kappa_inv = kappa.invert();
    FF minus_pow_kappa_minus_one = minus_pow_kappa * kappa_inv;

    // Receive evaluations g_j(kappa), t_j(1/kappa), t_j(\kappa), T_{j,prev}(\kappa), T_j(\kappa), j = 1,2,3,4
    std::array<FF, NUM_WIRES> inverted_t_evals;
    std::array<FF, NUM_WIRES> t_evals_inv;
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
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        inverted_t_evals[idx] = transcript->template receive_from_prover<FF>("inverted_t_eval_" + std::to_string(idx));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        t_evals_inv[idx] = transcript->template receive_from_prover<FF>("t_evals_inv_" + std::to_string(idx));
    }

    // Check t_j(1/kappa) = g_j(kappa) * kappa^{l-1}
    bool identity_checked = true;
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        identity_checked &= (t_evals_inv[idx] * minus_pow_kappa_minus_one + inverted_t_evals[idx] == 0);
    }

    // Allocate commitment vector
    std::vector<Commitment> verifier_commitments;
    verifier_commitments.reserve(NUM_WIRES * 4);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        verifier_commitments.push_back(t_commitments[idx]);
    }
    verifier_commitments.insert(verifier_commitments.end(), T_prev_commitments.begin(), T_prev_commitments.end());
    verifier_commitments.insert(verifier_commitments.end(), T_commitments.begin(), T_commitments.end());
    verifier_commitments.insert(
        verifier_commitments.end(), inverted_t_commitments.begin(), inverted_t_commitments.end());

    // Prepare opening vectors
    std::vector<OpeningVector> opening_vectors;
    opening_vectors.reserve(NUM_WIRES * 3);
    // Add opening claim for t_j(kappa) - kappa^l T_{j,prev}(kappa) - T_j(kappa) = 0
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        OpeningVector tmp(
            kappa, { FF::one(), minus_pow_kappa, FF::neg_one() }, { t_evals[idx], T_prev_evals[idx], T_evals[idx] });
        opening_vectors.emplace_back(tmp);
    }
    // Add opening claim for g_j(kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        OpeningVector tmp(kappa, { FF::one() }, { inverted_t_evals[idx] });
        opening_vectors.emplace_back(tmp);
    }
    // Add opening claim for t_j(1/kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        OpeningVector tmp(kappa_inv, { FF::one() }, { t_evals_inv[idx] });
        opening_vectors.emplace_back(tmp);
    }

    // Prepare indices
    std::vector<std::vector<size_t>> indices;
    // Add indices for opening claim for t_j(kappa) - kappa^l T_{j,prev}(kappa) - T_j(kappa) = 0
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        std::vector<size_t> tmp{ idx, idx + NUM_WIRES, idx + 2 * NUM_WIRES };
        indices.emplace_back(tmp);
    }
    // Add indices for opening claim for g_j(kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        std::vector<size_t> tmp{ idx + 3 * NUM_WIRES };
        indices.emplace_back(tmp);
    }
    // Add indices for opening claim for t_j(1/kappa)
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        std::vector<size_t> tmp{ idx };
        indices.emplace_back(tmp);
    }

    // Initialize Shplonk verifier
    ShplonkVerifier verifier(verifier_commitments, transcript, 3 * NUM_WIRES);
    verifier.reduce_verification_vector_claims_no_finalize(indices, opening_vectors);

    // Export batched claim
    auto batch_opening_claim = verifier.export_batch_opening_claim(Commitment::one());

    // KZG verifier
    auto pairing_points = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, transcript);
    VerifierCommitmentKey pcs_vkey{};
    auto verified = pcs_vkey.pairing_check(pairing_points[0], pairing_points[1]);
    return identity_checked && verified;
}
} // namespace bb
