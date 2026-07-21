// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./translator_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_permutation_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_shiftable_first_coeff_zero_relation_impl.hpp"
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
        auto result = std::array<FF, 4>{ FF(in.get_limb(0).element),
                                         FF(in.get_limb(1).element),
                                         FF(in.get_limb(2).element),
                                         FF(in.get_limb(3).element) };
        // Ensure extracted limbs are witnesses, not constants
        for (const auto& limb : result) {
            BB_ASSERT(!limb.is_constant());
        }
        return result;
    };

    const auto compute_five_limbs = [](const BF& in) {
        auto result = std::array<FF, 5>{ FF(in.get_limb(0).element),
                                         FF(in.get_limb(1).element),
                                         FF(in.get_limb(2).element),
                                         FF(in.get_limb(3).element),
                                         FF(in.get_prime_basis_limb()) };
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

    // OriginTag false positive: The accumulated_result limbs originate from ECCVM verifier (different protocol phase)
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
/**
 * @brief Load translator proof and run the pre-sumcheck (Oink-like) phase.
 * @details Hashes the VK, populates relation parameters from ECCVM inputs, and receives all
 * wire commitments and beta/gamma challenges from the transcript. This phase corresponds to
 * what OinkProver/OinkVerifier do for the hiding kernel: it is the pre-sumcheck setup that
 * binds all committed data to the shared Fiat-Shamir transcript before the joint sumcheck.
 */
template <typename Flavor>
typename TranslatorVerifier_<Flavor>::VerifierCommitments TranslatorVerifier_<Flavor>::receive_pre_sumcheck()
{
    transcript->load_proof(proof);

    // Fiat-Shamir the vk hash
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("Translator vk hash in verifier: ", vk_hash);

    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    // For recursive verification, mark the accumulated result's prime basis limb as used
    // (it can be recovered from binary basis limbs, so no need to constrain it further)
    if constexpr (IsRecursive) {
        mark_witness_as_used(accumulated_result.get_prime_basis_limb());
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

    return commitments;
}

template <typename Flavor>
typename TranslatorVerifier_<Flavor>::ReductionResult TranslatorVerifier_<Flavor>::reduce_to_pairing_check()
{
    BB_BENCH_NAME("TranslatorVerifier::reduce");
    using PCS = typename Flavor::PCS;
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = typename ClaimBatcher::Batch;
    using Sumcheck = SumcheckVerifier<Flavor>;

    auto commitments = receive_pre_sumcheck();

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Execute Sumcheck Verifier
    Sumcheck sumcheck(transcript, alpha, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    std::vector<FF> gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
        "Sumcheck:gate_challenge", TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    auto sumcheck_output = sumcheck.verify(relation_parameters, gate_challenges);

    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Unshifted concat evals are reconstructed inside sumcheck (via complete_full_circuit_evaluations).
    // Here we only need the shifted concat evals for PCS, which are not stored in AllEntities.
    auto& claimed = sumcheck_output.claimed_evaluations;
    auto concat_shift_evals = TranslatorFlavor::reconstruct_concatenated_evaluations(
        claimed.get_groups_to_be_concatenated_shifted(), std::span<const FF>(sumcheck_output.challenge));

    // --- PCS: build opening claims and verify ---
    auto combined_unshifted_comms = commitments.get_pcs_unshifted();
    auto combined_unshifted_evals = claimed.get_pcs_unshifted();

    // For shifted: commitments use the getter, but evals must be assembled manually since
    // the reconstructed shifted concat evals live in a local array, not in AllEntities.
    auto combined_shifted_comms = commitments.get_pcs_to_be_shifted();
    RefVector<FF> combined_shifted_evals(claimed.get_pcs_shifted());
    for (auto& eval : concat_shift_evals) {
        combined_shifted_evals.push_back(eval);
    }

    if (combined_unshifted_comms.size() != TranslatorFlavor::NUM_PCS_UNSHIFTED ||
        combined_unshifted_evals.size() != TranslatorFlavor::NUM_PCS_UNSHIFTED ||
        combined_shifted_comms.size() != TranslatorFlavor::NUM_PCS_TO_BE_SHIFTED ||
        combined_shifted_evals.size() != TranslatorFlavor::NUM_PCS_TO_BE_SHIFTED) {
        throw_or_abort("Translator verifier: PCS commitment/evaluation size mismatch");
    }

    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ combined_unshifted_comms, combined_unshifted_evals },
                                .shifted = ClaimBatch{ combined_shifted_comms, combined_shifted_evals } };

    Commitment commitment_one;
    if constexpr (IsRecursive) {
        commitment_one = Commitment::one(builder);
    } else {
        commitment_one = Commitment::one();
    }

    auto [opening_claim, consistency_checked] =
        Shplemini::compute_batch_opening_claim(claim_batcher,
                                               sumcheck_output.challenge,
                                               commitment_one,
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);

    vinfo("Translator Verifier: sumcheck verified: ", sumcheck_output.verified);
    vinfo("Translator Verifier: consistency checked: ", consistency_checked);

    return { pairing_points, sumcheck_output.verified && consistency_checked };
}

// Explicit instantiations
template class TranslatorVerifier_<TranslatorFlavor>;
template class TranslatorVerifier_<TranslatorRecursiveFlavor>;

} // namespace bb
