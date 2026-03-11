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

/**
 * @brief Reduce the batch merge proof to a pairing check.
 *
 * @details The verifier receives commitments [C_0]..[C_{M-1}] as input (collected from the HN proof
 * verifications during the accumulation loop). Unused slots are the point at infinity. It then reads
 * [T], [G] and all evaluations from the proof, checks the concatenation and degree identities, and
 * reduces to a KZG pairing check.
 *
 * @param proof               Batch merge proof.
 * @param subtable_commitments [C_0]..[C_{M-1}] — interleaved column commitments for each subtable.
 * @return ReductionResult with pairing points and merged table commitments.
 */
template <size_t BatchSize, typename Curve>
typename BatchMergeVerifier_<BatchSize, Curve>::ReductionResult BatchMergeVerifier_<BatchSize, Curve>::
    reduce_to_pairing_check(const Proof& proof, const std::vector<TableCommitments>& subtable_commitments)
{
    transcript->load_proof(proof);

    const size_t M = subtable_commitments.size();

    // -------------------------------------------------------------------------
    // Receive N and shift sizes from the proof
    // -------------------------------------------------------------------------
    const FF num_subtables_ff = transcript->template receive_from_prover<FF>("batch_merge_num_subtables");
    size_t N;
    if constexpr (IsRecursive) {
        N = static_cast<size_t>(uint32_t(num_subtables_ff.get_value()));
    } else {
        N = static_cast<size_t>(uint32_t(num_subtables_ff));
    }

    std::vector<size_t> shift_sizes(N);
    size_t k_max = 0;
    for (size_t i = 0; i < N; ++i) {
        const FF shift_ff = transcript->template receive_from_prover<FF>("batch_merge_shift_size_" + std::to_string(i));
        size_t k_i;
        if constexpr (IsRecursive) {
            k_i = static_cast<size_t>(uint32_t(shift_ff.get_value()));
        } else {
            k_i = static_cast<size_t>(uint32_t(shift_ff));
        }
        shift_sizes[i] = k_i;
        k_max = std::max(k_max, k_i);
    }

    // -------------------------------------------------------------------------
    // Receive [T] commitments from proof
    // -------------------------------------------------------------------------
    TableCommitments merged_commitments;
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        merged_commitments[col] =
            transcript->template receive_from_prover<Commitment>("BATCH_MERGED_TABLE_" + std::to_string(col));
    }

    // -------------------------------------------------------------------------
    // Receive degree check challenges α_0..α_{M-1}
    // -------------------------------------------------------------------------
    std::vector<std::string> alpha_labels;
    alpha_labels.reserve(M);
    for (size_t i = 0; i < M; ++i) {
        alpha_labels.emplace_back("BATCH_MERGE_DEGREE_CHECK_" + std::to_string(i));
    }
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(alpha_labels);

    // -------------------------------------------------------------------------
    // Receive [G] commitments from proof
    // -------------------------------------------------------------------------
    std::vector<Commitment> G_commitments;
    G_commitments.reserve(NUM_COLUMNS);
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        G_commitments.emplace_back(
            transcript->template receive_from_prover<Commitment>("BATCH_MERGE_G_" + std::to_string(col)));
    }

    // -------------------------------------------------------------------------
    // Receive Shplonk batching challenges
    // -------------------------------------------------------------------------
    const size_t num_shplonk_challenges = (N + 2) * NUM_COLUMNS;
    std::vector<std::string> beta_labels;
    beta_labels.reserve(num_shplonk_challenges);
    for (size_t i = 0; i < num_shplonk_challenges; ++i) {
        beta_labels.emplace_back("BATCH_MERGE_SHPLONK_" + std::to_string(i));
    }
    std::vector<FF> betas = transcript->template get_challenges<FF>(beta_labels);

    // -------------------------------------------------------------------------
    // Receive evaluation challenge κ
    // -------------------------------------------------------------------------
    const FF kappa = transcript->template get_challenge<FF>("batch_merge_kappa");
    const FF kappa_inv = kappa.invert();

    // -------------------------------------------------------------------------
    // Receive evaluations from proof
    // -------------------------------------------------------------------------
    // c_evals[i][col] = C_i_col(κ)
    std::vector<std::vector<FF>> c_evals(N, std::vector<FF>(NUM_COLUMNS));
    for (size_t i = 0; i < N; ++i) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            c_evals[i][col] = transcript->template receive_from_prover<FF>("BATCH_MERGE_C_EVAL_" + std::to_string(i) +
                                                                           "_" + std::to_string(col));
        }
    }

    // t_evals[col] = T_col(κ)
    std::vector<FF> t_evals(NUM_COLUMNS);
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        t_evals[col] = transcript->template receive_from_prover<FF>("BATCH_MERGE_T_EVAL_" + std::to_string(col));
    }

    // g_evals[col] = G_col(κ^{-1})
    std::vector<FF> g_evals(NUM_COLUMNS);
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        g_evals[col] = transcript->template receive_from_prover<FF>("BATCH_MERGE_G_EVAL_" + std::to_string(col));
    }

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
        for (auto& e : g_evals) {
            e.set_origin_tag(kappa.get_origin_tag());
        }
    }

    // -------------------------------------------------------------------------
    // Verify concatenation and degree identities (per column)
    // -------------------------------------------------------------------------
    bool concatenation_verified = true;
    bool degree_check_verified = true;

    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        // Concatenation check: T(κ) = sum_i C_i(κ) * κ^{offset_i}
        // where offset_i = sum_{j < i} shift_sizes[j] * BATCH_SIZE
        {
            FF reconstructed(0);
            FF kappa_offset(1);
            for (size_t i = 0; i < N; ++i) {
                reconstructed += c_evals[i][col] * kappa_offset;
                // Advance offset by k_i * BATCH_SIZE for next subtable.
                // Note: kappa.pow(n) with integer n works both native and recursive.
                kappa_offset *= kappa.pow(shift_sizes[i] * BATCH_SIZE);
            }
            FF diff = reconstructed - t_evals[col];
            if constexpr (IsRecursive) {
                concatenation_verified &= (diff.get_value() == 0);
                diff.assert_equal(FF(0), "BatchMergeVerifier: concatenation identity failed");
            } else {
                concatenation_verified &= (diff == 0);
            }
        }

        // Degree check: G(κ^{-1}) * κ^{k_max*BATCH_SIZE - 1} = sum_i α_i * C_i(κ) * κ^{(k_max-k_i)*BATCH_SIZE}
        {
            FF rhs(0);
            for (size_t i = 0; i < N; ++i) {
                FF kappa_power = kappa.pow((k_max - shift_sizes[i]) * BATCH_SIZE);
                rhs += degree_check_challenges[i] * c_evals[i][col] * kappa_power;
            }
            FF lhs = g_evals[col] * kappa.pow(k_max * BATCH_SIZE - 1);
            FF diff = lhs - rhs;
            if constexpr (IsRecursive) {
                degree_check_verified &= (diff.get_value() == 0);
                diff.assert_equal(FF(0), "BatchMergeVerifier: degree identity failed");
            } else {
                degree_check_verified &= (diff == 0);
            }
        }
    }

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
    const Commitment shplonk_Q = transcript->template receive_from_prover<Commitment>("BATCH_MERGE_SHPLONK_Q");
    const FF z = transcript->template get_challenge<FF>("batch_merge_z");

    BatchOpeningClaim<Curve> batch_claim;
    // [Q] with scalar -(z - κ)
    batch_claim.commitments.emplace_back(shplonk_Q);
    batch_claim.scalars.emplace_back(-(z - kappa));

    FF constant_term(0);
    const FF scaling_G = (z - kappa) * (z - kappa_inv).invert();

    // [C_i_col] for each (i, col)
    for (size_t i = 0; i < N; ++i) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            batch_claim.commitments.emplace_back(subtable_commitments[i][col]);
            const FF beta = betas[i * NUM_COLUMNS + col];
            batch_claim.scalars.emplace_back(beta);
            constant_term -= beta * c_evals[i][col];
        }
    }
    // [T_col] for each col
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        batch_claim.commitments.emplace_back(merged_commitments[col]);
        const FF beta_T = betas[N * NUM_COLUMNS + col];
        batch_claim.scalars.emplace_back(beta_T);
        constant_term -= beta_T * t_evals[col];
    }
    // [G_col] for each col — scaled by (z-κ)/(z-κ^{-1})
    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        batch_claim.commitments.emplace_back(G_commitments[col]);
        const FF beta_G = betas[(N + 1) * NUM_COLUMNS + col];
        const FF scaled_beta_G = scaling_G * beta_G;
        batch_claim.scalars.emplace_back(scaled_beta_G);
        constant_term -= scaled_beta_G * g_evals[col];
    }
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

    return { pairing_points, merged_commitments, degree_check_verified && concatenation_verified };
}

// Explicit template instantiations
template class BatchMergeVerifier_<1, curve::BN254>;
template class BatchMergeVerifier_<1, stdlib::bn254<MegaCircuitBuilder>>;
template class BatchMergeVerifier_<4, curve::BN254>;
template class BatchMergeVerifier_<4, stdlib::bn254<MegaCircuitBuilder>>;

} // namespace bb
