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
    reduce_to_pairing_check(const Proof& proof, const FF hash)
{
    transcript->load_proof(proof);

    // -------------------------------------------------------------------------
    // Receive N and shift sizes from the proof
    // -------------------------------------------------------------------------
    const FF N = transcript->template receive_from_prover<FF>("batch_merge_num_subtables");

    std::vector<FF> shift_sizes(M);
    FF index = FF(0);
    for (size_t i = 0; i < M; ++i) {
        shift_sizes[i] = transcript->template receive_from_prover<FF>("batch_merge_shift_size_" + std::to_string(i));
        if constexpr (IsRecursive) {
            // Strip origin from the upper bound before ranged_less_than: the function
            // creates FREE_WITNESS internal witnesses that would otherwise clash with the
            // ORIGIN_TAGGED transcript value FF(M)-N.
            FF upper_bound = FF(M) - N;
            upper_bound.create_range_constraint(7); // IMPOSING RANGE CONSTRAINT OF 6 as M < 2^7 = 128
            upper_bound.set_origin_tag(OriginTag::constant());
            auto is_less_than = index.template ranged_less_than<7>(upper_bound);
            // Demote result to CONSTANT so conditional_assign can safely use the
            // ORIGIN_TAGGED shift_sizes[i].
            is_less_than.set_origin_tag(OriginTag::constant());
            shift_sizes[i] = FF::conditional_assign(is_less_than, FF(0), shift_sizes[i]);
        } else {
            shift_sizes[i] = index < M - static_cast<uint32_t>(N) ? FF(0) : shift_sizes[i];
        }
        index += FF(1);
    }

    // Set point at infinity
    Commitment point_at_infinity;
    if constexpr (IsRecursive) {
        point_at_infinity = Commitment::from_witness(N.get_context(), Curve::NativeCurve::Group::point_at_infinity);
        point_at_infinity.fix_witness();
        point_at_infinity.set_origin_tag(OriginTag::constant());
    } else {
        point_at_infinity = Curve::Group::point_at_infinity;
    }

    // -------------------------------------------------------------------------
    // Receive commitments to columns to be merged
    // -------------------------------------------------------------------------
    std::vector<std::vector<Commitment>> subtable_cols(M, std::vector<Commitment>(NUM_COLUMNS));
    for (size_t idx = 0; idx < M; ++idx) {
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            subtable_cols[idx][col] = transcript->template receive_from_prover<Commitment>(
                "COLUMN_" + std::to_string(col + (idx * NUM_COLUMNS)));
        }
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
    alpha_labels.reserve(NUM_COLUMNS * M);
    for (size_t i = 0; i < NUM_COLUMNS * M; ++i) {
        alpha_labels.emplace_back("BATCH_MERGE_DEGREE_CHECK_" + std::to_string(i));
    }
    std::vector<FF> degree_check_challenges = transcript->template get_challenges<FF>(alpha_labels);

    // -------------------------------------------------------------------------
    // Receive [G] commitments from proof
    // -------------------------------------------------------------------------
    Commitment reversed_batched_col =
        transcript->template receive_from_prover<Commitment>("BATCH_MERGE_REVERSED_COLUMNS");

    // -------------------------------------------------------------------------
    // Receive Shplonk batching challenges
    // -------------------------------------------------------------------------
    const size_t num_shplonk_challenges = (M + 1) * NUM_COLUMNS + 1;
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
    std::vector<std::vector<FF>> c_evals(M, std::vector<FF>(NUM_COLUMNS));
    for (size_t i = 0; i < M; ++i) {
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
    FF reversed_cols_eval = transcript->template receive_from_prover<FF>("BATCH_MERGE_REVERSED_COLS_EVAL");

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
    // Verify concatenation and degree identities (per column)
    // -------------------------------------------------------------------------
    bool concatenation_verified = true;
    bool degree_check_verified = true;

    for (size_t col = 0; col < NUM_COLUMNS; ++col) {
        // Concatenation check: T(κ) = sum_i C_i(κ) * κ^{offset_i}
        // where offset_i = sum_{j < i} shift_sizes[j] * BATCH_SIZE
        // Note: the offset for C_i is determined by the sizes of the *preceding*
        // subtables (j < i), so we step by shift_sizes[i-1], not shift_sizes[i].
        {
            FF reconstructed = c_evals[0][col];
            FF pow_kappa = FF(1);
            for (size_t i = 1; i < M; ++i) {
                pow_kappa *= kappa.pow(shift_sizes[i - 1] * FF(BATCH_SIZE));
                reconstructed += c_evals[i][col] * pow_kappa;
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
            for (size_t i = 0; i < M; ++i) {
                for (size_t col = 0; col < NUM_COLUMNS; col++) {
                    FF kappa_power = kappa_inv.pow(shift_sizes[i] * FF(BATCH_SIZE)) * kappa;
                    rhs += degree_check_challenges[i * NUM_COLUMNS + col] * c_evals[i][col] * kappa_power;
                }
            }
            FF lhs = reversed_cols_eval;
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
    // Check consistency of columns to be merged and running hash
    // -------------------------------------------------------------------------
    bool hash_verified = true;

    std::vector<FF> hash_inputs;
    FF calculated_hash;
    for (size_t idx = 0; idx < M; idx++) {
        for (size_t col = 0; col < NUM_COLUMNS; col++) {
            auto com_serialized = Transcript::Codec::serialize_to_fields(subtable_cols[M - idx - 1][col]);
            hash_inputs.insert(hash_inputs.end(), com_serialized.begin(), com_serialized.end());
        }
        if constexpr (IsRecursive) {
            // The Poseidon2 permutation creates fresh witness_t elements (FREE_WITNESS) for
            // each round's new state.  When inputs exceed rate=3, an intermediate duplex fires
            // and the resulting FREE_WITNESS state clashes with ORIGIN_TAGGED transcript fields
            // in the next state+=cache step.  Strip all origin tags first; the transcript has
            // already bound these fields to the proof, so this is safe.
            for (auto& f : hash_inputs) {
                f.set_origin_tag(OriginTag::constant());
            }
            calculated_hash = stdlib::poseidon2<typename Curve::Builder>::hash(hash_inputs);
            info("Calculated hash: ", calculated_hash.get_value());
            // The permutation leaves the output as a FREE_WITNESS witness_t.  Demote it to
            // CONSTANT so that subsequent arithmetic (next hash iteration, the final
            // expected_hash - calculated_hash comparison) does not clash with ORIGIN_TAGGED
            // values (e.g. the index_diff condition in the extension loop).
            calculated_hash.unset_free_witness_tag();
        } else {
            calculated_hash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(hash_inputs);
        }
        hash_inputs = { calculated_hash };
    }

    std::vector<FF> extended_hash = { hash };
    std::vector<FF> hash_inputs_extend;
    FF expected_hash = hash;
    auto infinity_serialized = Transcript::Codec::serialize_to_fields(point_at_infinity);

    index = FF(0);
    FF index_diff = (FF(M) - N);
    for (size_t idx = 0; idx < (M - 1); idx++) {
        hash_inputs_extend.push_back(extended_hash.back());
        for (size_t col = 0; col < NUM_COLUMNS; col++) {
            hash_inputs_extend.insert(hash_inputs_extend.end(), infinity_serialized.begin(), infinity_serialized.end());
        }
        if constexpr (IsRecursive) {
            extended_hash.push_back(stdlib::poseidon2<typename Curve::Builder>::hash(hash_inputs_extend));
            // Same reason as calculated_hash above: demote FREE_WITNESS output to CONSTANT so
            // the conditional_assign below (which involves ORIGIN_TAGGED index_diff) does not throw.
            extended_hash.back().unset_free_witness_tag();
        } else {
            extended_hash.push_back(
                crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(hash_inputs_extend));
        }
        hash_inputs_extend.clear();

        index += FF(1);
        auto index_diff_condition = index_diff == index;
        if constexpr (IsRecursive) {
            info("EXTENDED HASH: ", extended_hash.back().get_value());

            index_diff_condition.unset_free_witness_tag();
            expected_hash = FF::conditional_assign(index_diff_condition, extended_hash.back(), expected_hash);
        } else {
            expected_hash = index_diff_condition ? extended_hash.back() : expected_hash;
        }
    }

    if constexpr (IsRecursive) {
        info("HASH IN: ", hash.get_value());
        info("CALCULATED: ", calculated_hash.get_value());
        FF hash_diff = expected_hash - calculated_hash;
        hash_verified &= (hash_diff.get_value() == 0);
        hash_diff.assert_equal(FF(0), "BatchMergeVerifier: column commitments hash mismatch");
    } else {
        hash_verified &= (expected_hash == calculated_hash);
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
    for (size_t i = 0; i < M; ++i) {
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
        const FF beta_T = betas[M * NUM_COLUMNS + col];
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

    return { pairing_points, merged_commitments, degree_check_verified && concatenation_verified && hash_verified };
}

// Explicit template instantiations
template class BatchMergeVerifier_<1, curve::BN254>;
template class BatchMergeVerifier_<1, stdlib::bn254<MegaCircuitBuilder>>;
template class BatchMergeVerifier_<4, curve::BN254>;
template class BatchMergeVerifier_<4, stdlib::bn254<MegaCircuitBuilder>>;

} // namespace bb
