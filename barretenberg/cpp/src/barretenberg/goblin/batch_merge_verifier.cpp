// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "batch_merge_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

// TODO: WHAT HAPPENS IF N == 0?
template <typename Curve, size_t MaxMergeSize>
typename BatchMergeVerifier_<Curve, MaxMergeSize>::ReductionResult BatchMergeVerifier_<Curve, MaxMergeSize>::
    reduce_to_pairing_check(const Proof& proof, const FF hash)
{
    auto flat_idx = [&](size_t idx_table, size_t idx_wire) { return (idx_table * NUM_WIRES) + idx_wire; };

    transcript->load_proof(proof);

    // -------------------------------------------------------------------------
    // Step 1: Receive commitments to columns to be merged
    // -------------------------------------------------------------------------
    std::vector<std::vector<Commitment>> subtable_cols(MAX_MERGE_SIZE, std::vector<Commitment>(NUM_WIRES));
    std::vector<FF> calculated_hashes;
    for (size_t idx = 0; idx < MAX_MERGE_SIZE; ++idx) {
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            subtable_cols[idx][col] =
                transcript->template receive_from_prover<Commitment>("COLUMN_" + std::to_string(flat_idx(idx, col)));
        }
        calculated_hashes.push_back(transcript->template get_challenge<FF>("HASH_" + std::to_string(idx)));
    }

    // -------------------------------------------------------------------------
    // Step 2: Receive N and shift sizes from the proof
    // -------------------------------------------------------------------------
    const FF N = transcript->template receive_from_prover<FF>("NUM_SUBTABLES");

    std::vector<FF> shift_sizes(MaxMergeSize);
    // Array s.t. indicator_array[i] = (i < N)
    std::vector<FF> indicator_array = compute_indicator_array(N);

    for (size_t i = 0; i < MaxMergeSize; ++i) {
        shift_sizes[i] = transcript->template receive_from_prover<FF>("SHIFT_SIZE_" + std::to_string(i));
        shift_sizes[i] = shift_sizes[i] * indicator_array[i]; // zero out shift sizes for unused subtables
    }

    // -------------------------------------------------------------------------
    // Step 3: Receive [T] commitments from proof
    // -------------------------------------------------------------------------
    TableCommitments merged_commitments;
    for (size_t col = 0; col < NUM_WIRES; ++col) {
        merged_commitments[col] =
            transcript->template receive_from_prover<Commitment>("MERGED_COLUMN_" + std::to_string(col));
    }

    // -------------------------------------------------------------------------
    // Step 4: Compute degree check challenges 1, α, α^2, .., α^{M * NUM_WIRES-1}
    // -------------------------------------------------------------------------
    std::vector<FF> degree_check_challenges;
    const FF degree_check_challenge = transcript->template get_challenge<FF>("DEGREE_CHECK_CHALLENGE");
    degree_check_challenges = { FF(1), degree_check_challenge };
    for (size_t idx = 2; idx < NUM_WIRES * MAX_MERGE_SIZE; idx++) {
        degree_check_challenges.push_back(degree_check_challenges.back() * degree_check_challenge);
    }

    // -------------------------------------------------------------------------
    // Step 5: Receive [G] commitments from proof
    // -------------------------------------------------------------------------
    Commitment degree_check_commitment = transcript->template receive_from_prover<Commitment>("DEGREE_CHECK_POLY");

    // -------------------------------------------------------------------------
    // Step 6: Compute Shplonk batching challenges
    // -------------------------------------------------------------------------
    const size_t num_shplonk_challenges = ((MAX_MERGE_SIZE + 1) * NUM_WIRES) + 1;
    const FF shplonk_batching_challenge = transcript->template get_challenge<FF>("SHPLONK_BATCHING_CHALLENGE");
    std::vector<FF> betas = { FF(1), shplonk_batching_challenge };
    for (size_t idx = 2; idx < num_shplonk_challenges; idx++) {
        betas.push_back(betas.back() * shplonk_batching_challenge);
    }

    // -------------------------------------------------------------------------
    // Step 7: Compute evaluation challenge κ, powers of kappa and their inverses
    // -------------------------------------------------------------------------
    const FF kappa = transcript->template get_challenge<FF>("KAPPA");
    const FF kappa_inv = kappa.invert();

    std::vector<FF> powers_of_kappa;
    for (size_t idx = 0; idx < MAX_MERGE_SIZE; idx++) {
        if constexpr (IsRecursive) {
            // Shift sizes are at most 2^CONST_ECCVM_LOG_N so the implicit range constraint enforced by pow is always
            // satisfied
            powers_of_kappa.push_back(kappa.template pow<CONST_ECCVM_LOG_N>(shift_sizes[idx]));
        } else {
            powers_of_kappa.push_back(kappa.pow(shift_sizes[idx]));
        }
    }

    std::vector<FF> powers_of_kappa_inv;
    if constexpr (IsRecursive) {
        for (size_t idx = 0; idx < MAX_MERGE_SIZE; idx++) {
            powers_of_kappa_inv.push_back(powers_of_kappa[idx].invert());
        }
    } else {
        powers_of_kappa_inv = powers_of_kappa;
        FF::batch_invert(powers_of_kappa_inv);
    }

    // -------------------------------------------------------------------------
    // Step 8: Receive evaluations
    // -------------------------------------------------------------------------
    // C_i_col(κ)
    std::vector<FF> evals(num_shplonk_challenges);
    for (size_t i = 0; i < MAX_MERGE_SIZE; ++i) {
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            evals.push_back(transcript->template receive_from_prover<FF>("C_EVAL_" + std::to_string(i) + "_" +
                                                                         std::to_string(col)));
        }
    }

    // T_col(κ)
    for (size_t col = 0; col < NUM_WIRES; ++col) {
        evals.push_back(transcript->template receive_from_prover<FF>("MERGED_EVAL_" + std::to_string(col)));
    }

    // G_col(κ^{-1})
    evals.push_back(transcript->template receive_from_prover<FF>("DEGREE_CHECK_EVAL"));

    // Set origin tags for recursive circuit (evals are PCS-bound by kappa)
    if constexpr (IsRecursive) {
        for (auto& e : evals) {
            e.set_origin_tag(kappa.get_origin_tag());
        }
        evals.back().set_origin_tag(kappa_inv.get_origin_tag());
    }

    // -------------------------------------------------------------------------
    // Step 9: Verify concatenation identity, degree identity, and hash consistency
    // -------------------------------------------------------------------------
    const bool concatenation_verified = check_concatenation_identity(evals, powers_of_kappa);
    const bool degree_check_verified =
        check_degree_identity(evals, powers_of_kappa_inv, kappa, degree_check_challenges);

    // TODO!!!!
    const bool hash_verified = check_hash_consistency(hash, calculated_hashes, indicator_array);

    // -------------------------------------------------------------------------
    // Build Shplonk batch opening claim and reduce to KZG pairing check
    //
    //   Claim: { Q', (z, 0) }  where
    //     Q'(X) = -Q*(z-κ)
    //             + sum_{col} sum_i β_{i*NC+col} * ([C_i_col] - c_i_col)
    //             + sum_{col} β_{N*NC+col} * ([T_col] - t_col)
    //             + (z-κ)/(z-κ^{-1}) * sum_{col} β_{(N+1)*NC+col} * ([G_col] - g_col)
    //
    // Stored as: commitments = [Q, C_0_0, ..., C_{N-1}_{NC-1}, T_0, ..., T_{NC-1},
    //                           G_0, ..., G_{NC-1}, ONE]
    //            scalars    = [-(z-κ), β_{0*NC+0}, ..., β_{N*NC+NC-1} (scaled by (z-κ)/(z-κ^{-1}))
    //                          for G, -constant_sum for ONE]
    // -------------------------------------------------------------------------
    const Commitment shplonk_batched_quotient = transcript->template receive_from_prover<Commitment>("SHPLONK_Q");
    const FF z = transcript->template get_challenge<FF>("Z");

    BatchOpeningClaim<Curve> batch_claim = compute_shplonk_opening_claim(subtable_cols,
                                                                         merged_commitments,
                                                                         degree_check_commitment,
                                                                         shplonk_batched_quotient,
                                                                         z,
                                                                         betas,
                                                                         kappa,
                                                                         kappa_inv,
                                                                         evals);

    BB_ASSERT(batch_claim.commitments.size() == MERGE_BATCHED_CLAIM_SIZE);
    BB_ASSERT(batch_claim.scalars.size() == MERGE_BATCHED_CLAIM_SIZE);

    PairingPoints pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(batch_claim), transcript);

    vinfo("BatchMergeVerifier: concatenation check passed: ", concatenation_verified ? "true" : "false");
    vinfo("BatchMergeVerifier: degree check passed: ", degree_check_verified ? "true" : "false");
    vinfo("BatchMergeVerifier: hash check passed: ", hash_verified ? "true" : "false");

    return { pairing_points, merged_commitments, degree_check_verified && concatenation_verified && hash_verified };
}

template <typename Curve, size_t MaxMergeSize>
std::vector<typename BatchMergeVerifier_<Curve, MaxMergeSize>::FF> BatchMergeVerifier_<Curve, MaxMergeSize>::
    compute_indicator_array(const FF& N) const
{
    // Array s.t. indicator_array[i] = (i < N)
    std::vector<FF> indicator_array;
    if constexpr (IsRecursive) {
        BB_ASSERT_GT(N.get_value(), 0U);

        // Range constraint N
        N.create_range_constraint(LOG_MAX_MERGE_SIZE, "BatchMergeVerifier: N must be fit in LOG_MAX_MERGE_SIZE bits.");

        // Create the array
        const FF max_merge_size = FF(MaxMergeSize);
        for (size_t idx = 0; idx < MaxMergeSize; idx++) {
            const FF idx_wit = FF(idx);
            indicator_array.push_back(idx_wit.template ranged_less_than<LOG_MAX_MERGE_SIZE>(max_merge_size));
        }
    } else {
        BB_ASSERT_GT(static_cast<uint32_t>(N), 0U);
        for (size_t idx = 0; idx < MAX_MERGE_SIZE; idx++) {
            indicator_array.push_back(idx < MAX_MERGE_SIZE ? FF(1) : FF(0));
        }
    }

    return indicator_array;
}

template <typename Curve, size_t MaxMergeSize>
std::vector<typename BatchMergeVerifier_<Curve, MaxMergeSize>::FF> BatchMergeVerifier_<Curve, MaxMergeSize>::
    compute_dirac_array(const std::vector<FF>& indicator_array) const
{
    // Shift to the left the indicator array (i < N) to get shifted_indicator_array[i] = (i < N - 1)
    std::vector<FF> shifted_indicator_array;
    for (size_t i = 0; i < MAX_MERGE_SIZE - 1; ++i) {
        shifted_indicator_array.push_back(indicator_array[i + 1]);
    }
    shifted_indicator_array.push_back(FF(0));

    // Construct array s.t. dirac_array[i] = (i == N - 1)
    std::vector<FF> dirac_array;
    for (size_t i = 0; i < MAX_MERGE_SIZE; ++i) {
        dirac_array.push_back(indicator_array[i] - shifted_indicator_array[i]);
    }

    return dirac_array;
}

template <typename Curve, size_t MaxMergeSize>
bool BatchMergeVerifier_<Curve, MaxMergeSize>::check_concatenation_identity(
    std::vector<FF>& evals, const std::vector<FF>& pow_kappa_subtable_size) const
{
    const size_t merged_eval_base = MAX_MERGE_SIZE * NUM_WIRES;

    bool concatenation_verified = true;
    for (size_t j = 0; j < NUM_WIRES; ++j) {
        FF concatenation_diff = FF(0);
        // Horner: i from N-1 down to 0 — accum ← accum · κ^{size_i} + T_{i,j}(κ).
        for (size_t i_rev = 0; i_rev < MAX_MERGE_SIZE; ++i_rev) {
            const size_t i = MAX_MERGE_SIZE - 1 - i_rev;
            concatenation_diff *= pow_kappa_subtable_size[i];
            concatenation_diff += evals[(i * NUM_WIRES) + j];
        }
        concatenation_diff -= evals[merged_eval_base + j];

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

template <typename Curve, size_t MaxMergeSize>
bool BatchMergeVerifier_<Curve, MaxMergeSize>::check_degree_identity(
    std::vector<FF>& evals,
    const std::vector<FF>& powers_of_kappa_inv,
    const FF& kappa,
    const std::vector<FF>& degree_check_challenges) const
{
    FF degree_check_diff(0);
    for (size_t i = 0; i < MAX_MERGE_SIZE; ++i) {
        for (size_t j = 0; j < NUM_WIRES; ++j) {
            degree_check_diff += degree_check_challenges[(i * NUM_WIRES) + j] * powers_of_kappa_inv[i] * kappa *
                                 evals[(i * NUM_WIRES) + j];
        }
    }
    degree_check_diff -= evals.back();

    bool degree_check_verified = true;
    if constexpr (IsRecursive) {
        degree_check_verified &= degree_check_diff.get_value() == 0;
        degree_check_diff.assert_equal(FF(0), "assert_equal: merge degree identity failed in Merge Verifier");
    } else {
        degree_check_verified &= degree_check_diff == 0;
    }

    return degree_check_verified;
}

template <typename Curve, size_t MaxMergeSize>
typename BatchMergeVerifier_<Curve, MaxMergeSize>::FF BatchMergeVerifier_<Curve, MaxMergeSize>::ecc_op_hash_step(
    const std::vector<Commitment>& col_commitments, const std::optional<FF>& prev_hash)
{
    std::vector<FF> hash_inputs;
    if (prev_hash.has_value()) {
        if constexpr (IsRecursive) {
            FF h = prev_hash.value();
            h.set_origin_tag(OriginTag::constant());
            hash_inputs.push_back(h);
        } else {
            hash_inputs.push_back(prev_hash.value());
        }
    }
    for (const auto& com : col_commitments) {
        auto com_serialized = Transcript::Codec::serialize_to_fields(com);
        if constexpr (IsRecursive) {
            for (auto& el : com_serialized) {
                el.set_origin_tag(OriginTag::constant());
            }
        }
        hash_inputs.insert(hash_inputs.end(), com_serialized.begin(), com_serialized.end());
    }
    if constexpr (IsRecursive) {
        FF hash_result = stdlib::poseidon2<typename Curve::Builder>::hash(hash_inputs);
        hash_result.unset_free_witness_tag();
        hash_result.set_origin_tag(OriginTag::constant());
        return hash_result;
    } else {
        return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(hash_inputs);
    }
}

template <typename Curve, size_t MaxMergeSize>
bool BatchMergeVerifier_<Curve, MaxMergeSize>::check_hash_consistency(const FF& hash,
                                                                      const std::vector<FF>& calculated_hashes,
                                                                      const std::vector<FF>& indicator_array) const
{
    // Construct array s.t. dirac_array[i] = (i == N - 1)
    std::vector<FF> dirac_array = compute_dirac_array(indicator_array);

    // Compute element-wise product of extended_hash and dirac_array
    FF expected_hash = dirac_array[0] * calculated_hashes[0];
    for (size_t i = 1; i < MAX_MERGE_SIZE; ++i) {
        expected_hash += calculated_hashes[i] * dirac_array[i];
    }

    FF hash_diff = expected_hash - hash;
    bool verified = true;
    if constexpr (IsRecursive) {
        verified = hash_diff.get_value() == 0;
        hash_diff.assert_equal(FF(0), "BatchMergeVerifier: column commitments hash mismatch");
    } else {
        verified = hash_diff == FF(0);
    }

    return verified;
}

template <typename Curve, size_t MaxMergeSize>
BatchOpeningClaim<Curve> BatchMergeVerifier_<Curve, MaxMergeSize>::compute_shplonk_opening_claim(
    const std::vector<std::vector<Commitment>>& subtable_commitments,
    const TableCommitments& merged_commitments,
    const Commitment& degree_check_commitment,
    const Commitment& shplonk_batched_quotient,
    const FF& shplonk_opening_challenge,
    const std::vector<FF>& shplonk_batching_challenges,
    const FF& kappa,
    const FF& kappa_inv,
    const std::vector<FF>& evals) const
{
    // Claim {Q', (z, 0)} where Q' = -Q·(z - κ) + Σ_group commitments·β_group - Σ evals·β_group·correction
    //                              + (z - κ)/(z - κ⁻¹)·β_G (G - g)
    BatchOpeningClaim<Curve> batch_opening_claim;

    // Commitments: [Q], table_commitments (T_i's, M, G in canonical order), [1]
    batch_opening_claim.commitments = { std::move(shplonk_batched_quotient) };
    for (auto& subtable : subtable_commitments) {
        for (auto& commitment : subtable) {
            batch_opening_claim.commitments.emplace_back(std::move(commitment));
        }
    }
    for (auto& commitment : merged_commitments) {
        batch_opening_claim.commitments.emplace_back(commitment);
    }
    batch_opening_claim.commitments.emplace_back(degree_check_commitment);
    if constexpr (IsRecursive) {
        batch_opening_claim.commitments.emplace_back(Commitment::one(kappa.get_context()));
    } else {
        batch_opening_claim.commitments.emplace_back(Commitment::one());
    }

    // Scalars: -(z - κ), β_1..β_{M-1}, β_M·(z - κ)/(z - κ⁻¹), -(Σ β·evals + β_M·g·(z-κ)/(z-κ⁻¹))
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

// Explicit template instantiations
template class BatchMergeVerifier_<curve::BN254, CHONK_MAX_NUM_CIRCUITS>;
template class BatchMergeVerifier_<stdlib::bn254<MegaCircuitBuilder>, CHONK_MAX_NUM_CIRCUITS>;

// For testing
template class BatchMergeVerifier_<curve::BN254, 4>;
template class BatchMergeVerifier_<stdlib::bn254<MegaCircuitBuilder>, 4>;

} // namespace bb
