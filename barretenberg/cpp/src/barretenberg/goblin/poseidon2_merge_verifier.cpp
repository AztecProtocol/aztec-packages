#include "poseidon2_merge_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

/**
 * @brief Check concatenation identities: l_j + κ^k · r_j = m_j for each wire j.
 *
 * NOTE: Identical to MergeVerifier_::check_concatenation_identities but with NUM_WIRES = 5.
 */
template <typename Curve>
bool Poseidon2MergeVerifier_<Curve>::check_concatenation_identities(std::vector<FF>& evals,
                                                                    const FF& pow_kappa) const
{
    bool concatenation_verified = true;
    FF concatenation_diff(0);
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        concatenation_diff = evals[idx] + (pow_kappa * evals[idx + NUM_WIRES]) - evals[idx + (2 * NUM_WIRES)];
        if constexpr (IsRecursive) {
            concatenation_verified &= concatenation_diff.get_value() == 0;
            concatenation_diff.assert_equal(
                FF(0), "assert_equal: poseidon2 merge concatenation identity failed in Merge Verifier");
        } else {
            concatenation_verified &= concatenation_diff == 0;
        }
    }
    return concatenation_verified;
}

/**
 * @brief Check degree identity: Σ α_i · l_i = g · κ^(k-1).
 *
 * NOTE: Identical to MergeVerifier_::check_degree_identity but with NUM_WIRES = 5.
 */
template <typename Curve>
bool Poseidon2MergeVerifier_<Curve>::check_degree_identity(std::vector<FF>& evals,
                                                           const FF& pow_kappa_minus_one,
                                                           const std::vector<FF>& degree_check_challenges) const
{
    bool degree_check_verified = true;
    FF degree_check_diff(0);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        degree_check_diff += evals[idx] * degree_check_challenges[idx];
    }
    degree_check_diff -= evals.back() * pow_kappa_minus_one;
    if constexpr (IsRecursive) {
        degree_check_verified &= degree_check_diff.get_value() == 0;
        degree_check_diff.assert_equal(FF(0),
                                       "assert_equal: poseidon2 merge degree identity failed in Merge Verifier");
    } else {
        degree_check_verified &= degree_check_diff == 0;
    }
    return degree_check_verified;
}

/**
 * @brief Compute Shplonk opening claim from table commitments and evaluations.
 *
 * NOTE: Identical to MergeVerifier_::compute_shplonk_opening_claim but with NUM_WIRES = 5.
 */
template <typename Curve>
BatchOpeningClaim<Curve> Poseidon2MergeVerifier_<Curve>::compute_shplonk_opening_claim(
    const std::vector<Commitment>& table_commitments,
    const Commitment& shplonk_batched_quotient,
    const FF& shplonk_opening_challenge,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    const std::vector<FF>& evals) const
{
    BatchOpeningClaim<Curve> batch_opening_claim;

    batch_opening_claim.commitments = { std::move(shplonk_batched_quotient) };
    for (auto& commitment : table_commitments) {
        batch_opening_claim.commitments.emplace_back(std::move(commitment));
    }
    if constexpr (IsRecursive) {
        batch_opening_claim.commitments.emplace_back(Commitment::one(kappa.get_context()));
    } else {
        batch_opening_claim.commitments.emplace_back(Commitment::one());
    }

    batch_opening_claim.scalars = { -(shplonk_opening_challenge - kappa) };
    for (auto& scalar : shplonk_batching_challenges) {
        batch_opening_claim.scalars.emplace_back(std::move(scalar));
    }
    batch_opening_claim.scalars.back() *=
        (shplonk_opening_challenge - kappa) * (shplonk_opening_challenge - kappa_inv).invert();

    batch_opening_claim.scalars.emplace_back(FF(0));
    for (size_t idx = 0; idx < evals.size(); idx++) {
        if (idx < evals.size() - 1) {
            batch_opening_claim.scalars.back() -= evals[idx] * shplonk_batching_challenges[idx];
        } else {
            batch_opening_claim.scalars.back() -= shplonk_batching_challenges.back() * evals.back() *
                                                  (shplonk_opening_challenge - kappa) *
                                                  (shplonk_opening_challenge - kappa_inv).invert();
        }
    }

    batch_opening_claim.evaluation_point = { shplonk_opening_challenge };
    return batch_opening_claim;
}

/**
 * @brief Verify Poseidon2 merge proof: concatenation + degree checks + Shplonk opening.
 *
 * @details Identical protocol to MergeVerifier_::reduce_to_pairing_check but with
 * 5 wire columns and P2_ prefixed transcript labels.
 */
template <typename Curve>
typename Poseidon2MergeVerifier_<Curve>::ReductionResult Poseidon2MergeVerifier_<Curve>::reduce_to_pairing_check(
    const Proof& proof, const InputCommitments& input_commitments)
{
    transcript->load_proof(proof);

    const FF shift_size = transcript->template receive_from_prover<FF>("p2_shift_size");
    if constexpr (IsRecursive) {
        BB_ASSERT_GT(uint32_t(shift_size.get_value()), 0U, "Shift size should always be bigger than 0");
    } else {
        BB_ASSERT_GT(shift_size, 0U, "Shift size should always be bigger than 0");
    }

    TableCommitments merged_table_commitments;
    std::vector<Commitment> table_commitments;
    table_commitments.reserve((3 * NUM_WIRES) + 1);

    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(settings == MergeSettings::PREPEND ? input_commitments.t_commitments[idx]
                                                                          : input_commitments.T_prev_commitments[idx]);
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(settings == MergeSettings::PREPEND ? input_commitments.T_prev_commitments[idx]
                                                                          : input_commitments.t_commitments[idx]);
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("P2_MERGED_TABLE_" + std::to_string(idx)));
        merged_table_commitments[idx] = table_commitments.back();
    }

    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(labels_degree_check);
    table_commitments.emplace_back(
        transcript->template receive_from_prover<Commitment>("P2_REVERSED_BATCHED_LEFT_TABLES"));

    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_challenges<FF>(labels_shplonk_batching_challenges);

    const FF kappa = transcript->template get_challenge<FF>("p2_kappa");
    const FF kappa_inv = kappa.invert();
    const FF pow_kappa = kappa.pow(shift_size);
    const FF pow_kappa_minus_one = pow_kappa * kappa_inv;

    std::vector<FF> evals;
    evals.reserve((3 * NUM_WIRES) + 1);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(
            transcript->template receive_from_prover<FF>("P2_LEFT_TABLE_EVAL_" + std::to_string(idx)));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(
            transcript->template receive_from_prover<FF>("P2_RIGHT_TABLE_EVAL_" + std::to_string(idx)));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(
            transcript->template receive_from_prover<FF>("P2_MERGED_TABLE_EVAL_" + std::to_string(idx)));
    }
    evals.emplace_back(transcript->template receive_from_prover<FF>("P2_REVERSED_BATCHED_LEFT_TABLES_EVAL"));

    if constexpr (IsRecursive) {
        for (auto& eval : evals) {
            eval.set_origin_tag(kappa.get_origin_tag());
        }
        evals.back().set_origin_tag(degree_check_challenges.back().get_origin_tag());
    }

    bool concatenation_verified = check_concatenation_identities(evals, pow_kappa);
    bool degree_check_verified = check_degree_identity(evals, pow_kappa_minus_one, degree_check_challenges);

    Commitment shplonk_batched_quotient =
        transcript->template receive_from_prover<Commitment>("P2_SHPLONK_BATCHED_QUOTIENT");
    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("p2_shplonk_opening_challenge");

    BatchOpeningClaim<Curve> batch_opening_claim = compute_shplonk_opening_claim(table_commitments,
                                                                                 shplonk_batched_quotient,
                                                                                 shplonk_opening_challenge,
                                                                                 shplonk_batching_challenges,
                                                                                 kappa,
                                                                                 kappa_inv,
                                                                                 evals);

    BB_ASSERT(batch_opening_claim.commitments.size() == MERGE_BATCHED_CLAIM_SIZE);
    BB_ASSERT(batch_opening_claim.scalars.size() == MERGE_BATCHED_CLAIM_SIZE);

    PairingPoints pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), transcript);

    vinfo("Poseidon2 Merge Verifier: degree check passed: ", degree_check_verified ? "true" : "false");
    vinfo("Poseidon2 Merge Verifier: concatenation check passed: ", concatenation_verified ? "true" : "false");

    return { pairing_points, merged_table_commitments, degree_check_verified && concatenation_verified };
}

// Explicit template instantiations
template class Poseidon2MergeVerifier_<curve::BN254>;
template class Poseidon2MergeVerifier_<stdlib::bn254<MegaCircuitBuilder>>;
template class Poseidon2MergeVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
