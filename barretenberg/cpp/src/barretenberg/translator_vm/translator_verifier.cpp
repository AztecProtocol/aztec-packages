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

template <typename Flavor>
std::pair<std::array<typename TranslatorVerifier_<Flavor>::FF, TranslatorFlavor::NUM_CONCATENATED_POLYS>,
          std::array<typename TranslatorVerifier_<Flavor>::FF, TranslatorFlavor::NUM_CONCATENATED_POLYS>>
TranslatorVerifier_<Flavor>::reconstruct_concatenated_evaluations(const std::vector<FF>& challenge,
                                                                  const std::vector<RefVector<FF>>& groups,
                                                                  const std::vector<RefVector<FF>>& shift_groups)
{
    static constexpr size_t CONCATENATION_GROUP_SIZE = TranslatorFlavor::CONCATENATION_GROUP_SIZE;
    static constexpr size_t NUM_CONCATENATED_POLYS = TranslatorFlavor::NUM_CONCATENATED_POLYS;
    static constexpr size_t NUM_TOP_BITS = numeric::get_msb(CONCATENATION_GROUP_SIZE);
    static constexpr size_t LOG_N = TranslatorFlavor::CONST_TRANSLATOR_LOG_N;

    // Compute CONCATENATION_GROUP_SIZE-point Lagrange basis over the top challenges
    std::array<FF, CONCATENATION_GROUP_SIZE> lagrange_basis;
    for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; j++) {
        lagrange_basis[j] = FF(1);
        for (size_t bit = 0; bit < NUM_TOP_BITS; bit++) {
            const FF& u = challenge[LOG_N - NUM_TOP_BITS + bit];
            lagrange_basis[j] *= ((j >> bit) & 1) ? u : (FF(1) - u);
        }
    }
    // L_0 is the "padding" factor from wires having support in [1, MINI)
    FF padding_inv = lagrange_basis[0].invert();

    // Reconstruct a single concatenated eval: [1/L_0] * Σ_j L_j * wire_j(u)
    auto reconstruct = [&](const auto& group) -> FF {
        FF result = FF(0);
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; j++) {
            result += lagrange_basis[j] * group[j];
        }
        return result * padding_inv;
    };

    std::array<FF, NUM_CONCATENATED_POLYS> concat_evals;
    std::array<FF, NUM_CONCATENATED_POLYS> concat_shift_evals;
    for (size_t g = 0; g < NUM_CONCATENATED_POLYS; g++) {
        concat_evals[g] = reconstruct(groups[g]);
        concat_shift_evals[g] = reconstruct(shift_groups[g]);
    }
    return { concat_evals, concat_shift_evals };
}

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

    put_translation_data_in_relation_parameters();

    // Receive Gemini masking polynomial commitment (for ZK-PCS)
    commitments.gemini_masking_poly = transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");

    // Op queue wire commitments are provided by merge protocol, not from the translator proof
    commitments.op = op_queue_wire_commitments[0];
    commitments.x_lo_y_hi = op_queue_wire_commitments[1];
    commitments.x_hi_z_1 = op_queue_wire_commitments[2];
    commitments.y_lo_z_2 = op_queue_wire_commitments[3];

    // Receive commitments to non-op-queue wires and ordered range constraints
    for (auto [comm, label] : zip_view(commitments.get_non_opqueue_wires_and_ordered_range_constraints(),
                                       commitment_labels.get_non_opqueue_wires_and_ordered_range_constraints())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // Permutation challenges
    FF beta = transcript->template get_challenge<FF>("beta");
    FF gamma = transcript->template get_challenge<FF>("gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    commitments.z_perm = transcript->template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // --- Sumcheck ---
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    Sumcheck sumcheck(transcript, alpha, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    std::vector<FF> gate_challenges(TranslatorFlavor::CONST_TRANSLATOR_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Receive first Libra commitment before sumcheck
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    std::vector<FF> padding_indicator_array(TranslatorFlavor::CONST_TRANSLATOR_LOG_N, FF(1));
    auto sumcheck_output = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator_array);

    // Receive remaining Libra commitments after sumcheck
    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // --- Concatenation consistency: reconstruct concat evals from wire evals ---
    auto& claimed = sumcheck_output.claimed_evaluations;
    auto [concat_evals, concat_shift_evals] =
        reconstruct_concatenated_evaluations(sumcheck_output.challenge,
                                             claimed.get_groups_to_be_concatenated(),
                                             claimed.get_groups_to_be_concatenated_shifted());

    // Write reconstructed unshifted concat evals into AllEntities so getters work
    auto concat_eval_refs = claimed.get_concatenated();
    for (size_t g = 0; g < concat_evals.size(); g++) {
        concat_eval_refs[g] = concat_evals[g];
    }

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

    BB_ASSERT_EQ(combined_unshifted_comms.size(), TranslatorFlavor::NUM_PCS_UNSHIFTED);
    BB_ASSERT_EQ(combined_unshifted_evals.size(), TranslatorFlavor::NUM_PCS_UNSHIFTED);
    BB_ASSERT_EQ(combined_shifted_comms.size(), TranslatorFlavor::NUM_PCS_TO_BE_SHIFTED);
    BB_ASSERT_EQ(combined_shifted_evals.size(), TranslatorFlavor::NUM_PCS_TO_BE_SHIFTED);

    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ combined_unshifted_comms, combined_unshifted_evals },
                                .shifted = ClaimBatch{ combined_shifted_comms, combined_shifted_evals } };

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
