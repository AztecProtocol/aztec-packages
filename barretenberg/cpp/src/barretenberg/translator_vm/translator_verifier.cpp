// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./translator_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_permutation_relation_impl.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

namespace {
// Native helper: slice uint256_t values into limbs
template <typename Flavor>
void put_translation_data_in_relation_parameters_impl(RelationParameters<typename Flavor::FF>& relation_parameters,
                                                      const uint256_t& evaluation_input_x,
                                                      const typename Flavor::BF& batching_challenge_v,
                                                      const uint256_t& accumulated_result)
    requires(!Flavor::Curve::is_stdlib_type)
{
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;

    const auto compute_four_limbs = [](const auto& in) {
        constexpr size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
        return std::array<FF, 4>{ in.slice(0, NUM_LIMB_BITS),
                                  in.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                  in.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                  in.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4) };
    };

    const auto compute_five_limbs = [](const auto& in) {
        constexpr size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
        return std::array<FF, 5>{ in.slice(0, NUM_LIMB_BITS),
                                  in.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                  in.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                  in.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                  in };
    };

    relation_parameters.evaluation_input_x = compute_five_limbs(evaluation_input_x);

    uint256_t batching_challenge_v_power{ batching_challenge_v };
    for (size_t i = 0; i < 4; i++) {
        relation_parameters.batching_challenge_v[i] = compute_five_limbs(batching_challenge_v_power);
        batching_challenge_v_power = BF(batching_challenge_v_power) * batching_challenge_v;
    }

    relation_parameters.accumulated_result = compute_four_limbs(accumulated_result);
}

// Recursive helper: extract limbs from bigfield elements
template <typename Flavor>
void put_translation_data_in_relation_parameters_impl(RelationParameters<typename Flavor::FF>& relation_parameters,
                                                      const typename Flavor::BF& evaluation_input_x,
                                                      const typename Flavor::BF& batching_challenge_v,
                                                      const typename Flavor::BF& accumulated_result)
    requires(Flavor::Curve::is_stdlib_type)
{
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;

    const auto compute_four_limbs = [](const BF& in) {
        auto result = std::array<FF, 4>{ FF(in.binary_basis_limbs[0].element),
                                         FF(in.binary_basis_limbs[1].element),
                                         FF(in.binary_basis_limbs[2].element),
                                         FF(in.binary_basis_limbs[3].element) };
        // Ensure extracted limbs are witnesses, not constants
        for (const auto& limb : result) {
            BB_ASSERT(!limb.is_constant());
        }
        return result;
    };

    const auto compute_five_limbs = [](const BF& in) {
        auto result = std::array<FF, 5>{ FF(in.binary_basis_limbs[0].element),
                                         FF(in.binary_basis_limbs[1].element),
                                         FF(in.binary_basis_limbs[2].element),
                                         FF(in.binary_basis_limbs[3].element),
                                         FF(in.prime_basis_limb) };
        // Ensure extracted limbs are witnesses, not constants
        for (const auto& limb : result) {
            BB_ASSERT(!limb.is_constant());
        }
        return result;
    };

    relation_parameters.evaluation_input_x = compute_five_limbs(evaluation_input_x);

    BF batching_challenge_v_power = batching_challenge_v;
    for (size_t i = 0; i < 4; i++) {
        relation_parameters.batching_challenge_v[i] = compute_five_limbs(batching_challenge_v_power);
        batching_challenge_v_power = batching_challenge_v_power * batching_challenge_v;
    }

    relation_parameters.accumulated_result = compute_four_limbs(accumulated_result);

    // OriginTag: The accumulated_result limbs originate from ECCVM verifier (different protocol phase)
    // and are used directly in Translator relations. The fact that these values do not interact
    // with any other value from the Translator circuit would trigger the round provenance mechanism if we didn't clear
    // the round provenance. This cross-protocol usage is sound because:
    // 1. ECCVM proves correctness of translation evaluations via its own sumcheck + IPA
    // 2. ECCVM computes accumulated_result = (op + v·Px + v²·Py + v³·z1 + v⁴·z2 - masking) / x
    // 3. Translator re-computes the same accumulator non-natively in its circuit
    // 4. TranslatorAccumulatorTransferRelationImpl enforces exact equality at the final row:
    //    accumulators_binary_limbs_i == accumulated_result[i] for i ∈ {0,1,2,3}
    // This binds the two protocols - Translator output must match ECCVM claim.
    for (auto& limb : relation_parameters.accumulated_result) {
        limb.clear_round_provenance();
    }
}
} // namespace

template <typename Flavor> void TranslatorVerifier_<Flavor>::put_translation_data_in_relation_parameters()
{
    put_translation_data_in_relation_parameters_impl<Flavor>(
        relation_parameters, evaluation_input_x, batching_challenge_v, accumulated_result);
}

/**
 * @brief Verify the TranslatorFlavor Honk proof
 * @details This function verifies the Translator circuit which ensures consistency between
 * the ECCVM transcript and the op queue data. Returns verification result with pairing points and check status.
 */
template <typename Flavor>
typename TranslatorVerifier_<Flavor>::ReductionResult TranslatorVerifier_<Flavor>::reduce_to_pairing_check()
{
    using PCS = typename Flavor::PCS;
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = typename ClaimBatcher::Batch;
    using Sumcheck = SumcheckVerifier<Flavor>;

    // Load the proof produced by the translator prover
    transcript->load_proof(proof);

    // Fiat-Shamir the vk hash
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("Translator vk hash in verifier: ", vk_hash);

    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    // For recursive verification, mark the accumulated result's prime basis limb as used
    // (it can be recovered from binary basis limbs, so no need to constrain it further)
    if constexpr (IsRecursive) {
        mark_witness_as_used(accumulated_result.prime_basis_limb);
    }

    // Use accumulated_result from ECCVM verifier
    put_translation_data_in_relation_parameters();

    // Receive Gemini masking polynomial commitment (for ZK-PCS)
    commitments.gemini_masking_poly = transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");

    // Set op queue wire commitments (provided by merge protocol, not from translator proof)
    commitments.op = op_queue_wire_commitments[0];
    commitments.x_lo_y_hi = op_queue_wire_commitments[1];
    commitments.x_hi_z_1 = op_queue_wire_commitments[2];
    commitments.y_lo_z_2 = op_queue_wire_commitments[3];

    // Receive commitments to non-op-queue wires and ordered range constraints
    for (auto [comm, label] : zip_view(commitments.get_non_opqueue_wires_and_ordered_range_constraints(),
                                       commitment_labels.get_non_opqueue_wires_and_ordered_range_constraints())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // Get permutation challenges
    FF beta = transcript->template get_challenge<FF>("beta");
    FF gamma = transcript->template get_challenge<FF>("gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript->template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Execute Sumcheck Verifier
    Sumcheck sumcheck(transcript, alpha, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    std::vector<FF> gate_challenges(TranslatorFlavor::CONST_TRANSLATOR_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // Create padding indicator array
    std::vector<FF> padding_indicator_array(TranslatorFlavor::CONST_TRANSLATOR_LOG_N, FF(1));

    auto sumcheck_output = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator_array);

    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Concatenation consistency check: reconstruct concatenated evaluations from individual wire evaluations
    // using Lagrange decomposition over the top 4 sumcheck challenges.
    //
    // Wires have values in [1,MINI) embedded in 17D space, so wire_j(u_17d) = L_0(u_top) * wire_j(u_13d)
    // Therefore: concat(u) = [1/L_0(u_top)] * Σ_j L_j(u_top) * wire_j(u_17d)
    // where L_0(u_top) = (1-u_13)(1-u_14)(1-u_15)(1-u_16)

    const size_t log_n = TranslatorFlavor::CONST_TRANSLATOR_LOG_N;
    const size_t num_top_bits = 4; // log2(CONCATENATION_GROUP_SIZE)

    // Extract top 4 sumcheck challenges (u_{d-4}, ..., u_{d-1})
    std::array<FF, 4> u_top;
    for (size_t i = 0; i < num_top_bits; i++) {
        u_top[i] = sumcheck_output.challenge[log_n - num_top_bits + i];
    }

    // Compute L_0(u_top) = (1-u_13)(1-u_14)(1-u_15)(1-u_16)
    // This accounts for wires having values in [1,MINI) embedded in 17D space
    FF padding = FF(1);
    for (size_t i = 0; i < num_top_bits; i++) {
        padding *= (FF(1) - u_top[i]);
    }
    FF padding_inv = padding.invert();

    // Compute Lagrange basis L_j(u_top) for j = 0..15
    // L_j(u_top) = Π_{i=0}^{3} (bit_i(j) ? u_top[i] : (1 - u_top[i]))
    // Uses little-endian bit ordering: bit i of j corresponds to challenge u_top[i]
    std::array<FF, 16> lagrange_basis;
    for (size_t j = 0; j < 16; j++) {
        lagrange_basis[j] = FF(1);
        for (size_t bit = 0; bit < num_top_bits; bit++) {
            // Little-endian: LSB corresponds to first challenge
            bool bit_set = (j >> bit) & 1;
            lagrange_basis[j] *= bit_set ? u_top[bit] : (FF(1) - u_top[bit]);
        }
    }

    // Helper lambda: reconstruct concatenated evaluation from a group of wire evaluations
    // Wire polys have values in [1,MINI) embedded in 17D space with top bits = 0
    // So wire_j(u_17d) = L_0(u_top) * wire_j(u_bottom_13d)
    // Therefore: concat(u) = [1/L_0(u_top)] * Σ_j L_j(u_top) * wire_j(u_17d)
    auto reconstruct_concatenated_eval = [&](const auto& group) -> FF {
        FF result = FF(0);
        for (size_t j = 0; j < 16; j++) {
            result += lagrange_basis[j] * group[j];
        }
        return result * padding_inv;
    };

    // Get the groups of wire evaluations from sumcheck
    auto groups = sumcheck_output.claimed_evaluations.get_groups_to_be_concatenated();

    // Reconstruct concatenated evaluations (unshifted) using the helper
    auto concat_evals = sumcheck_output.claimed_evaluations.get_concatenated();
    for (size_t g = 0; g < groups.size(); g++) {
        concat_evals[g] = reconstruct_concatenated_eval(groups[g]);
    }

    // Reconstruct concatenated shifted evaluations using the same helper
    // For shifted: concat_shift(u) = [1/padding] * Σ_j L_j(u_top) * source_j_shift(u)
    // This works because f_j[0] = 0 for all minicircuit wires (enforced by zero constraint at row 0).

    // Get shifted groups using the flavor method
    auto shift_groups = sumcheck_output.claimed_evaluations.get_groups_to_be_concatenated_shifted();

    // Reconstruct concatenated shift evaluations using the helper
    std::array<FF, 5> concat_shift_evals;
    for (size_t g = 0; g < shift_groups.size(); g++) {
        concat_shift_evals[g] = reconstruct_concatenated_eval(shift_groups[g]);
    }

    // Build the unshifted claims: standard unshifted + concatenated (with reconstructed evals)
    // Unshifted base: masking(1) + ordered_extra(1) + op(1) + ordered(5) + z_perm(1) = 9
    // (12 computable precomputed selectors excluded — verifier computed them locally)
    auto unshifted_commitments = commitments.get_unshifted_without_concatenated();
    auto unshifted_evals = sumcheck_output.claimed_evaluations.get_unshifted_without_concatenated();
    auto concat_commitments = commitments.get_concatenated();

    // Combine: unshifted base + concatenated
    auto combined_unshifted_comms = concatenate(unshifted_commitments, concat_commitments);
    auto combined_unshifted_evals = concatenate(unshifted_evals, concat_evals);

    // Build the shifted claims: standard shifted + concatenated shifted
    // Use get_to_be_shifted() for commitments (9 entries) and get_pcs_shifted() for matching shifted evals (9 entries)
    auto shifted_commitments = commitments.get_to_be_shifted();
    auto shifted_evals = sumcheck_output.claimed_evaluations.get_pcs_shifted();

    // Store reconstructed evals into the concatenated polynomial eval slots
    auto& all_evals = sumcheck_output.claimed_evaluations;
    all_evals.concatenated_range_constraints_0 = concat_evals[0];
    all_evals.concatenated_range_constraints_1 = concat_evals[1];
    all_evals.concatenated_range_constraints_2 = concat_evals[2];
    all_evals.concatenated_range_constraints_3 = concat_evals[3];
    all_evals.concatenated_non_range = concat_evals[4];

    // Build combined shifted claims: standard shifted + 5 concatenated shifts
    auto combined_shifted_comms = concatenate(shifted_commitments, concat_commitments);
    // Combine shifted evals: convert RefArray to RefVector, then append reconstructed concat shift evals
    RefVector<FF> combined_shifted_evals(shifted_evals);
    for (auto& eval : concat_shift_evals) {
        combined_shifted_evals.push_back(eval);
    }

    // Execute Shplemini with standard batching (no InterleavedBatch)
    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ combined_unshifted_comms, combined_unshifted_evals },
                                .shifted = ClaimBatch{ combined_shifted_comms, combined_shifted_evals } };

    // Get Commitment::one() - requires builder for recursive case
    Commitment commitment_one;
    if constexpr (IsRecursive) {
        commitment_one = Commitment::one(builder);
    } else {
        commitment_one = Commitment::one();
    }

    auto [opening_claim, consistency_checked] =
        Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                               claim_batcher,
                                               sumcheck_output.challenge,
                                               commitment_one,
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);

    return { pairing_points, sumcheck_output.verified && consistency_checked };
}

// Explicit instantiations
template class TranslatorVerifier_<TranslatorFlavor>;
template class TranslatorVerifier_<TranslatorRecursiveFlavor>;

} // namespace bb
