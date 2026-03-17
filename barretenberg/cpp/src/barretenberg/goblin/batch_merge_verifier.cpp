// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "batch_merge_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

template <size_t BatchSize, typename Curve, size_t MaxMergeSize>
typename BatchMergeVerifier_<BatchSize, Curve, MaxMergeSize>::ReductionResult BatchMergeVerifier_<
    BatchSize,
    Curve,
    MaxMergeSize>::reduce_to_pairing_check(const Proof& proof, const FF hash)
{
    transcript->load_proof(proof);

    // -------------------------------------------------------------------------
    // Receive commitments to columns to be merged (FIRST — before N/shift_sizes so
    // that the transcript's Fiat-Shamir state covers the commitments before any
    // other prover messages, matching the accumulation hash ordering).
    // -------------------------------------------------------------------------
    std::vector<std::vector<Commitment>> subtable_cols(MaxMergeSize, std::vector<Commitment>(NUM_COLUMNS));
    std::vector<FF> calculated_hashes;
    for (size_t idx = 0; idx < MaxMergeSize; ++idx) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            subtable_cols[MaxMergeSize - idx - 1][col] = transcript->template receive_from_prover<Commitment>(
                "COLUMN_" + std::to_string(col + (idx * NUM_COLUMNS)));
        }
        calculated_hashes.push_back(transcript->template get_challenge<FF>("HASH_" + std::to_string(idx)));
    }

    // -------------------------------------------------------------------------
    // Receive N and shift sizes from the proof
    // -------------------------------------------------------------------------
    const FF N = transcript->template receive_from_prover<FF>("NUM_SUBTABLES");

    std::vector<FF> shift_sizes(MaxMergeSize);
    // Array s.t. indicator_array[i] = (i >= (M - N))
    std::vector<FF> indicator_array = compute_indicator_array(N);

    for (size_t i = 0; i < MaxMergeSize; ++i) {
        shift_sizes[i] = transcript->template receive_from_prover<FF>("SHIFT_SIZE_" + std::to_string(i));
        shift_sizes[i] = shift_sizes[i] * indicator_array[i]; // zero out shift sizes for unused subtables
    }

    // -------------------------------------------------------------------------
    // Receive [T] commitments from proof
    // -------------------------------------------------------------------------
    TableCommitments merged_commitments;
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        merged_commitments[col] =
            transcript->template receive_from_prover<Commitment>("MERGED_COLUMN_" + std::to_string(col));
    }

    // -------------------------------------------------------------------------
    // Compute degree check challenges α, α^2, .., α^M
    // -------------------------------------------------------------------------
    std::vector<FF> degree_check_challenges;
    degree_check_challenges.reserve(NUM_COLUMNS * MaxMergeSize);
    degree_check_challenges = { transcript->template get_challenge<FF>("DEGREE_CHECK_CHALLENGE") };
    for (size_t idx = 0; idx < NUM_COLUMNS * MaxMergeSize - 1; idx++) {
        degree_check_challenges.push_back(degree_check_challenges.back() * degree_check_challenges[0]);
    }

    // -------------------------------------------------------------------------
    // Receive [G] commitments from proof
    // -------------------------------------------------------------------------
    Commitment reversed_batched_col = transcript->template receive_from_prover<Commitment>("REVERSED_COLUMNS");

    // -------------------------------------------------------------------------
    // Compute Shplonk batching challenges
    // -------------------------------------------------------------------------
    const size_t num_shplonk_challenges = (MaxMergeSize + 1) * NUM_COLUMNS + 1;
    std::vector<FF> betas;
    betas.reserve(num_shplonk_challenges);
    betas = { transcript->template get_challenge<FF>("SHPLONK_CHALLENGE") };
    for (size_t idx = 0; idx < num_shplonk_challenges; idx++) {
        betas.push_back(betas.back() * betas[0]);
    }

    // -------------------------------------------------------------------------
    // Receive evaluation challenge κ
    // -------------------------------------------------------------------------
    const FF kappa = transcript->template get_challenge<FF>("KAPPA");
    const FF kappa_inv = kappa.invert();

    // -------------------------------------------------------------------------
    // Compute powers of kappa and their inverses
    // -------------------------------------------------------------------------
    std::vector<FF> powers_of_kappa(MaxMergeSize);
    // Shift sizes are at most 2^CONST_ECCVM_LOG_N, adjust the pow log n to take into account the batch size
    static constexpr size_t POW_LOG_N = []() {
        size_t pow_log_n = CONST_ECCVM_LOG_N;
        if constexpr (BATCH_SIZE == 2) {
            pow_log_n += 1;
        } else if constexpr (BATCH_SIZE == 4) {
            pow_log_n += 2;
        }
        return pow_log_n;
    }();

    for (size_t idx = 0; idx < MaxMergeSize; idx++) {
        if constexpr (IsRecursive) {
            powers_of_kappa[idx] = kappa.template pow_log_n<POW_LOG_N>(shift_sizes[idx] * FF(BATCH_SIZE));
        } else {
            powers_of_kappa[idx] = kappa.pow(shift_sizes[idx] * FF(BATCH_SIZE));
        }
    }

    std::vector<FF> powers_of_kappa_inv(MaxMergeSize);
    for (size_t idx = 0; idx < MaxMergeSize; idx++) {
        powers_of_kappa_inv[idx] = powers_of_kappa[idx].invert();
    }

    // -------------------------------------------------------------------------
    // Receive evaluations from proof
    // -------------------------------------------------------------------------
    // c_evals[i][col] = C_i_col(κ)
    std::vector<std::vector<FF>> c_evals(MaxMergeSize, std::vector<FF>(NUM_COLUMNS));
    for (size_t i = 0; i < MaxMergeSize; ++i) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            c_evals[i][col] =
                transcript->template receive_from_prover<FF>("C_EVAL_" + std::to_string(i) + "_" + std::to_string(col));
        }
    }

    // t_evals[col] = T_col(κ)
    std::vector<FF> t_evals(NUM_COLUMNS);
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        t_evals[col] = transcript->template receive_from_prover<FF>("MERGED_EVAL_" + std::to_string(col));
    }

    // g_evals[col] = G_col(κ^{-1})
    FF reversed_cols_eval = transcript->template receive_from_prover<FF>("REVERSED_COLUMNS_EVAL");

    // Set origin tags for recursive circuit (evals are PCS-bound by kappa)
    if constexpr (IsRecursive) {
        for (auto& row : c_evals) {
            for (auto& e : row) {
                e.set_origin_tag(kappa.get_origin_tag());
            }
        }
        for (auto& e : t_evals) {
            e.set_origin_tag(kappa.get_origin_tag());
        }
        reversed_cols_eval.set_origin_tag(kappa.get_origin_tag());
    }

    // -------------------------------------------------------------------------
    // Verify concatenation identity, degree identity, and hash consistency
    // -------------------------------------------------------------------------
    const bool concatenation_verified = check_concatenation_identity(c_evals, t_evals, powers_of_kappa);
    const bool degree_check_verified =
        check_degree_identity(c_evals, reversed_cols_eval, powers_of_kappa_inv, degree_check_challenges, kappa);
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
    const Commitment shplonk_Q = transcript->template receive_from_prover<Commitment>("SHPLONK_Q");
    const FF z = transcript->template get_challenge<FF>("Z");

    BatchOpeningClaim<Curve> batch_claim;
    // [Q] with scalar -(z - κ)
    batch_claim.commitments.emplace_back(shplonk_Q);
    batch_claim.scalars.emplace_back(-(z - kappa));

    FF constant_term(0);
    const FF scaling_G = (z - kappa) * (z - kappa_inv).invert();

    // [C_i_col] for each (i, col)
    for (size_t i = 0; i < MaxMergeSize; ++i) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            batch_claim.commitments.emplace_back(subtable_cols[i][col]);
            const FF beta = betas[i * NUM_COLUMNS + col];
            batch_claim.scalars.emplace_back(beta);
            constant_term -= beta * c_evals[i][col];
        }
    }
    // [T_col] for each col
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        batch_claim.commitments.emplace_back(merged_commitments[col]);
        const FF beta_T = betas[MaxMergeSize * NUM_COLUMNS + col];
        batch_claim.scalars.emplace_back(beta_T);
        constant_term -= beta_T * t_evals[col];
    }
    // [G_col] for each col — scaled by (z-κ)/(z-κ^{-1}){
    batch_claim.commitments.emplace_back(reversed_batched_col);
    const FF scaled_beta_G = scaling_G * betas.back();
    batch_claim.scalars.emplace_back(scaled_beta_G);
    constant_term -= scaled_beta_G * reversed_cols_eval;
    // [1] commitment for the constant term
    if constexpr (IsRecursive) {
        batch_claim.commitments.emplace_back(Commitment::one(kappa.get_context()));
    } else {
        batch_claim.commitments.emplace_back(Commitment::one());
    }
    batch_claim.scalars.emplace_back(constant_term);
    batch_claim.evaluation_point = { z };

    PairingPoints pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(batch_claim), transcript);

    vinfo("BatchMergeVerifier: concatenation check passed: ", concatenation_verified ? "true" : "false");
    vinfo("BatchMergeVerifier: degree check passed: ", degree_check_verified ? "true" : "false");
    vinfo("BatchMergeVerifier: hash check passed: ", hash_verified ? "true" : "false");

    return { pairing_points, merged_commitments, degree_check_verified && concatenation_verified && hash_verified };
}

template <size_t BatchSize, typename Curve, size_t MaxMergeSize>
std::vector<typename BatchMergeVerifier_<BatchSize, Curve, MaxMergeSize>::FF> BatchMergeVerifier_<
    BatchSize,
    Curve,
    MaxMergeSize>::compute_indicator_array(const FF& N) const
{
    // Array s.t. indicator_array[i] = (i >= (M - N))
    std::vector<FF> indicator_array;
    if constexpr (IsRecursive) {
        BB_ASSERT_GT(N.get_value(), 0U);
        // 0 < N <= M --> M > M - N >= 0
        // This means that the array defined by (i < M - N) always ends with 0 (as M - N < M).
        // Hence, to compute the indicator array we compute the array (i < M - N + 1), shift it to the
        // left by 1, and then flip its values

        // 1) Array (i < M - N + 1)
        indicator_array = stdlib::compute_padding_indicator_array<Curve, MaxMergeSize>(FF(MaxMergeSize) - N + FF(1));
        // 2) Shift left by 1
        indicator_array.erase(indicator_array.begin());
        indicator_array.push_back(FF(0));
        // 3) Flip values
        for (auto& el : indicator_array) {
            el = FF(1) - el;
        }
    } else {
        BB_ASSERT_GT(static_cast<uint32_t>(N), 0U);
        for (size_t idx = 0; idx < MaxMergeSize; idx++) {
            indicator_array.push_back(idx < MaxMergeSize - static_cast<uint32_t>(N) ? FF(0) : FF(1));
        }
    }

    return indicator_array;
}

template <size_t BatchSize, typename Curve, size_t MaxMergeSize>
std::vector<typename BatchMergeVerifier_<BatchSize, Curve, MaxMergeSize>::FF> BatchMergeVerifier_<
    BatchSize,
    Curve,
    MaxMergeSize>::compute_dirac_array(const std::vector<FF>& indicator_array) const
{
    // Shift to the right the indicator array (i >= M - N) to get shifted_indicator_array[i] = (i >= M - N + 1).
    std::vector<FF> shifted_indicator_array;
    shifted_indicator_array.reserve(MaxMergeSize);
    shifted_indicator_array = { FF(0) };
    for (size_t i = 0; i < MaxMergeSize - 1; ++i) {
        shifted_indicator_array.push_back(indicator_array[i]);
    }

    // Construct array s.t. dirac_array[i] = (i == (M - N))
    std::vector<FF> dirac_array;
    dirac_array.reserve(MaxMergeSize);
    for (size_t i = 0; i < MaxMergeSize; ++i) {
        dirac_array.push_back(indicator_array[i] - shifted_indicator_array[i]);
    }

    // Reverse the array to get dirac_array[i] = (i == N - 1)
    std::reverse(dirac_array.begin(), dirac_array.end());

    return dirac_array;
}

template <size_t BatchSize, typename Curve, size_t MaxMergeSize>
bool BatchMergeVerifier_<BatchSize, Curve, MaxMergeSize>::check_concatenation_identity(
    const std::vector<std::vector<FF>>& c_evals,
    const std::vector<FF>& t_evals,
    const std::vector<FF>& powers_of_kappa) const
{
    bool verified = true;
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        FF reconstructed = c_evals[0][col];
        FF pow_kappa = FF(1);
        for (size_t i = 1; i < MaxMergeSize; ++i) {
            pow_kappa *= powers_of_kappa[i - 1];
            reconstructed += c_evals[i][col] * pow_kappa;
        }
        FF diff = reconstructed - t_evals[col];
        if constexpr (IsRecursive) {
            verified &= (diff.get_value() == 0);
            diff.assert_equal(FF(0), "BatchMergeVerifier: concatenation identity failed");
        } else {
            verified &= (diff == 0);
        }
    }
    return verified;
}

template <size_t BatchSize, typename Curve, size_t MaxMergeSize>
bool BatchMergeVerifier_<BatchSize, Curve, MaxMergeSize>::check_degree_identity(
    const std::vector<std::vector<FF>>& c_evals,
    const FF& reversed_cols_eval,
    const std::vector<FF>& powers_of_kappa_inv,
    const std::vector<FF>& degree_check_challenges,
    const FF& kappa) const
{
    FF rhs(0);
    for (size_t i = 0; i < MaxMergeSize; ++i) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            FF kappa_power = powers_of_kappa_inv[i] * kappa;
            rhs += degree_check_challenges[i * NUM_COLUMNS + col] * c_evals[i][col] * kappa_power;
        }
    }
    FF diff = reversed_cols_eval - rhs;
    if constexpr (IsRecursive) {
        bool verified = (diff.get_value() == 0);
        diff.assert_equal(FF(0), "BatchMergeVerifier: degree identity failed");
        return verified;
    } else {
        return diff == 0;
    }
}

template <size_t BatchSize, typename Curve, size_t MaxMergeSize>
typename BatchMergeVerifier_<BatchSize, Curve, MaxMergeSize>::FF BatchMergeVerifier_<BatchSize, Curve, MaxMergeSize>::
    ecc_op_hash_step(const std::vector<Commitment>& col_commitments, const std::optional<FF>& prev_hash)
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

template <size_t BatchSize, typename Curve, size_t MaxMergeSize>
bool BatchMergeVerifier_<BatchSize, Curve, MaxMergeSize>::check_hash_consistency(
    const FF& hash, const std::vector<FF>& calculated_hashes, const std::vector<FF>& indicator_array) const
{
    // Construct array s.t. dirac_array[i] = (i == (M - N))
    std::vector<FF> dirac_array = compute_dirac_array(indicator_array);

    // Compute element-wise product of extended_hash and dirac_array
    FF expected_hash = dirac_array[0] * calculated_hashes[0];
    for (size_t i = 1; i < MaxMergeSize; ++i) {
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

// Explicit template instantiations
template class BatchMergeVerifier_<1, curve::BN254, 48>;
template class BatchMergeVerifier_<1, stdlib::bn254<MegaCircuitBuilder>, 48>;
template class BatchMergeVerifier_<2, curve::BN254, 74>;
template class BatchMergeVerifier_<2, stdlib::bn254<MegaCircuitBuilder>, 74>;
template class BatchMergeVerifier_<4, curve::BN254, CHONK_MAX_ACCUMULATION_STEPS>;
template class BatchMergeVerifier_<4, stdlib::bn254<MegaCircuitBuilder>, CHONK_MAX_ACCUMULATION_STEPS>;

// For testing
template class BatchMergeVerifier_<1, curve::BN254, 4>;
template class BatchMergeVerifier_<1, stdlib::bn254<MegaCircuitBuilder>, 4>;
template class BatchMergeVerifier_<4, curve::BN254, 4>;
template class BatchMergeVerifier_<4, stdlib::bn254<MegaCircuitBuilder>, 4>;

} // namespace bb
