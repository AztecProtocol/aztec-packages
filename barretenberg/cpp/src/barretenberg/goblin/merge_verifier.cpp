// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: d1307bdee7f2ee0e737c19b77a26204a8dbafafc}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "merge_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

template <typename Curve>
bool MergeVerifier_<Curve>::check_concatenation_identities(std::vector<FF>& evals, const FF& pow_kappa) const
{
    bool concatenation_verified = true;
    FF concatenation_diff(0);
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        // Identity: L(κ) + κ^ℓ · R(κ) = M(κ)
        concatenation_diff = evals[idx] + (pow_kappa * evals[idx + NUM_WIRES]) - evals[idx + (2 * NUM_WIRES)];
        if constexpr (IsRecursive) {
            concatenation_verified &= concatenation_diff.get_value() == 0;
            concatenation_diff.assert_equal(FF(0),
                                            "assert_equal: merge concatenation identity failed in Merge Verifier");
        } else {
            concatenation_verified &= concatenation_diff == 0;
        }
    }
    return concatenation_verified;
}

template <typename Curve>
bool MergeVerifier_<Curve>::check_degree_identity(const std::vector<FF>& evals,
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
        degree_check_diff.assert_equal(FF(0), "assert_equal: merge degree identity failed in Merge Verifier");
    } else {
        degree_check_verified &= degree_check_diff == 0;
    }

    return degree_check_verified;
}

template <typename Curve>
BatchOpeningClaim<Curve> MergeVerifier_<Curve>::compute_shplonk_opening_claim(
    const std::vector<Commitment>& table_commitments,
    const Commitment& shplonk_batched_quotient,
    const FF& shplonk_opening_challenge,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    const std::vector<FF>& evals) const
{
    // Claim {Q', (z, 0)} where Q' = -Q·(z - κ) + Σᵢ βᵢLᵢ + Σᵢ βᵢRᵢ + Σᵢ βᵢMᵢ + (z - κ)/(z - κ⁻¹)·βG
    //                              - Σᵢ βᵢlᵢ - Σᵢ βᵢrᵢ - Σᵢ βᵢmᵢ - (z - κ)/(z - κ⁻¹)·β·g
    BatchOpeningClaim<Curve> batch_opening_claim;

    // Commitment: [L_1], [L_2], ..., [L_n], [R_1], ..., [R_n], [M_1], ..., [M_n], [G], [1]
    batch_opening_claim.commitments = { std::move(shplonk_batched_quotient) };
    for (auto& commitment : table_commitments) {
        batch_opening_claim.commitments.emplace_back(std::move(commitment));
    }
    if constexpr (IsRecursive) {
        batch_opening_claim.commitments.emplace_back(Commitment::one(kappa.get_context()));
    } else {
        batch_opening_claim.commitments.emplace_back(Commitment::one());
    }

    // Scalars: -(z - κ), β₁...β₁₂, β₁₃·(z - κ)/(z - κ⁻¹), -(Σᵢ βᵢlᵢ + Σᵢ βᵢrᵢ + Σᵢ βᵢmᵢ + β₁₃·(z - κ)/(z - κ⁻¹)·g)
    batch_opening_claim.scalars = { -(shplonk_opening_challenge - kappa) };
    for (auto& scalar : shplonk_batching_challenges) {
        batch_opening_claim.scalars.emplace_back(std::move(scalar));
    }

    FF ratio = (shplonk_opening_challenge - kappa) * (shplonk_opening_challenge - kappa_inv).invert();
    batch_opening_claim.scalars.back() *= ratio;

    batch_opening_claim.scalars.emplace_back(FF(0));
    for (size_t idx = 0; idx < evals.size(); idx++) {
        if (idx < evals.size() - 1) {
            batch_opening_claim.scalars.back() -= evals[idx] * shplonk_batching_challenges[idx];
        } else {
            batch_opening_claim.scalars.back() -= shplonk_batching_challenges.back() * evals.back() * ratio;
        }
    }

    batch_opening_claim.evaluation_point = { shplonk_opening_challenge };

    return batch_opening_claim;
}

/**
 * @brief Verify proper construction of the aggregate Goblin ECC op queue polynomials T_j.
 * @details Verifies that M_j(X) = L_j(X) + X^k * R_j(X) and deg(L_j) < k for j = 1,2,3,4.
 * Checks concatenation and degree identities, then verifies Shplonk opening proof.
 *
 * @see MERGE_PROTOCOL.md for complete protocol specification.
 * @param proof The merge proof to verify
 * @param input_commitments Commitments to the subtable being merged (t) and to the aggregate table prior to this
 * merge (T_prev, covering all subtables up to and including the tail)
 * @return VerificationResult containing pairing points, merged table commitments, and check results
 */
template <typename Curve>
typename MergeVerifier_<Curve>::ReductionResult MergeVerifier_<Curve>::reduce_to_pairing_check(
    const Proof& proof, const InputCommitments& input_commitments)
{
    BB_BENCH_NAME("MergeVerifier::reduce");
    transcript->load_proof(proof);

    // Hard-coded shift size: the merge is only used when verifying the hiding kernel, in which case the shift size is
    // fixed to preserve zero-knowledge
    const FF shift_size = FF(ECCOpQueue::compute_fixed_append_offset(ECCOpQueue::get_append_offset_for_verifier()));

    // Store T_commitments of the verifier
    TableCommitments merged_table_commitments;

    // Vector of commitments
    // The vector is composed of: [L_1], .., [L_4], [R_1], .., [R_4], [M_1], .., [M_4], [G]
    // The input commitments are not absorbed here; the caller must already have bound them to the shared transcript.
    // In Chonk this happens in the preceding Oink phase.
    std::vector<Commitment> table_commitments;
    table_commitments.reserve((3 * NUM_WIRES) + 1);
    table_commitments.insert(table_commitments.end(),
                             input_commitments.T_prev_commitments.begin(),
                             input_commitments.T_prev_commitments.end());
    table_commitments.insert(
        table_commitments.end(), input_commitments.t_commitments.begin(), input_commitments.t_commitments.end());
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        table_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("MERGED_TABLE_" + std::to_string(idx)));
        merged_table_commitments[idx] = table_commitments.back();
    }

    // Generate degree check batching challenges
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(labels_degree_check);

    // Receive commitment to reversed batched left table
    table_commitments.emplace_back(
        transcript->template receive_from_prover<Commitment>("REVERSED_BATCHED_LEFT_TABLES"));

    // Evaluation challenge
    const FF kappa = transcript->template get_challenge<FF>("kappa");
    const FF kappa_inv = kappa.invert();
    const FF pow_kappa = kappa.pow(shift_size);
    const FF pow_kappa_minus_one = pow_kappa * kappa_inv;

    // Receive evaluations of [Lᵢ], [Rᵢ], [Mᵢ] at κ
    std::vector<FF> evals;
    evals.reserve((3 * NUM_WIRES) + 1);
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("LEFT_TABLE_EVAL_" + std::to_string(idx)));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("RIGHT_TABLE_EVAL_" + std::to_string(idx)));
    }
    for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
        evals.emplace_back(transcript->template receive_from_prover<FF>("MERGED_TABLE_EVAL_" + std::to_string(idx)));
    }

    // Receive evaluation of G at 1/κ
    evals.emplace_back(transcript->template receive_from_prover<FF>("REVERSED_BATCHED_LEFT_TABLES_EVAL"));

    // OriginTag false positive: evals are PCS bound - once the table commitments are fixed and kappa is derived, the
    // correct evaluations are uniquely determined. The origin tag mechanism alerts us that we are mixing a challenge
    // from a previous round (kappa) with element sent afterwards, which in this case is OK because the evals are
    // uniquely determined.
    std::vector<OriginTag> origin_tags;
    origin_tags.reserve(evals.size());

    if constexpr (IsRecursive) {
        for (auto& eval : evals) {
            origin_tags.emplace_back(eval.get_origin_tag());
            eval.set_origin_tag(pow_kappa.get_origin_tag());
        }
    }

    // Check concatenation identities
    bool concatenation_verified = check_concatenation_identities(evals, pow_kappa);

    // Check degree identity
    bool degree_check_verified = check_degree_identity(evals, pow_kappa_minus_one, degree_check_challenges);

    // Reset origin tags
    if constexpr (IsRecursive) {
        for (auto [eval, origin_tag] : zip_view(evals, origin_tags)) {
            eval.set_origin_tag(origin_tag);
        }
    }

    // Compute batching challenges
    std::vector<FF> shplonk_batching_challenges =
        transcript->template get_short_challenges<FF>(labels_shplonk_batching_challenges);

    // Receive Shplonk batched quotient
    Commitment shplonk_batched_quotient =
        transcript->template receive_from_prover<Commitment>("SHPLONK_BATCHED_QUOTIENT");

    // Generate Shplonk opening challenge
    FF shplonk_opening_challenge = transcript->template get_challenge<FF>("shplonk_opening_challenge");

    // Prepare batched opening claim to be passed to KZG
    BatchOpeningClaim<Curve> batch_opening_claim = compute_shplonk_opening_claim(table_commitments,
                                                                                 shplonk_batched_quotient,
                                                                                 shplonk_opening_challenge,
                                                                                 shplonk_batching_challenges,
                                                                                 kappa,
                                                                                 kappa_inv,
                                                                                 evals);

    BB_ASSERT(batch_opening_claim.commitments.size() == MERGE_BATCHED_CLAIM_SIZE);
    BB_ASSERT(batch_opening_claim.scalars.size() == MERGE_BATCHED_CLAIM_SIZE);

    // KZG verifier - returns PairingPoints directly
    PairingPoints pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), transcript);

    vinfo("Merge Verifier: degree check passed: ", degree_check_verified ? "true" : "false");
    vinfo("Merge Verifier: concatenation check passed: ", concatenation_verified ? "true" : "false");

    return { pairing_points, merged_table_commitments, degree_check_verified && concatenation_verified };
}

// Explicit template instantiations
template class MergeVerifier_<curve::BN254>;
template class MergeVerifier_<stdlib::bn254<MegaCircuitBuilder>>;
template class MergeVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
