// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "recursive_verifier.hpp"

#include <algorithm>
#include <cstddef>
#include <memory>
#include <numeric>

#include "barretenberg/commitment_schemes/interleaving_utils.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/shared_shifted_virtual_zeroes_array.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/avm_fixed_vk.hpp"

namespace bb::avm2 {

/**
 * @brief Construct a new AvmRecursiveVerifier
 *
 * @details The constructor fixes the verification key and vk hash of the AVM circuit by copying them into the
 * selectors.
 *
 * @param builder
 * @param transcript
 */
AvmRecursiveVerifier::AvmRecursiveVerifier(Builder& builder, const std::shared_ptr<Transcript>& transcript)
    : builder(builder)
    , transcript(transcript)
{
    auto native_vk = std::make_shared<NativeVerificationKey>();
    key = std::make_shared<VerificationKey>(&builder, native_vk);
    // Populate precomputed group commitments from the native VK's hardcoded values
    for (size_t g = 0; g < Flavor::NativeFlavor::NUM_PRECOMPUTED_GROUPS; g++) {
        key->precomputed_group_commitments[g] =
            Commitment::from_witness(&builder, native_vk->precomputed_group_commitments[g]);
        key->precomputed_group_commitments[g].fix_witness();
    }
}

/**
 * @brief Evaluate the given public input column over the multivariate challenge points
 *
 * @details Among its witness commitments, the AVM prover sends commitments to the public inputs. To enforce consistency
 * between these commitments and the public inputs, the verifier computes the evaluation of the public inputs sent in
 * the clear at the Sumcheck challenge and compares the result with the claimed evaluation sent by the Prover at the end
 * of Sumcheck.
 *
 * @param points The public input column to be evaluated
 * @param challenges The sumcheck challenge
 * @return FF
 */
AvmRecursiveVerifier::FF AvmRecursiveVerifier::evaluate_public_input_column(const std::vector<FF>& points,
                                                                            const std::vector<FF>& challenges)
{
    auto coefficients = SharedShiftedVirtualZeroesArray<FF>{
        .start_ = 0,
        .end_ = points.size(),
        .virtual_size_ = MAX_AVM_TRACE_SIZE,
        .backing_memory_ = BackingMemory<FF>::allocate(points.size()),
    };

    memcpy(
        static_cast<void*>(coefficients.data()), static_cast<const void*>(points.data()), sizeof(FF) * points.size());

    return generic_evaluate_mle<FF>(challenges, coefficients);
}

/**
 * @brief Verify an AVM proof and return PairingPoints whose validity bears witness to successful verification of the
 * proof.
 *
 * @details This function reduces verification of an AVM proof to a pairing check, which is deferred for performance
 * reasons.
 *
 * @note As the AVM verifier is arithmetized over Mega, this function does not enforce the validity of the elliptic
 * curve operations. Such verification is deferred to the circuit that verifies the proof of the circuit that contains
 * the AVM verifier.
 *
 */
AvmRecursiveVerifier::PairingPoints AvmRecursiveVerifier::verify_proof(
    const stdlib::Proof<Builder>& stdlib_proof, const std::vector<std::vector<FF>>& public_inputs)
{
    using RelationParams = RelationParameters<typename Flavor::FF>;
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using Challenges = Flavor::NativeFlavor::AllEntities<FF>;

    RelationParams relation_parameters;

    transcript->load_proof(stdlib_proof);

    // ========== Execute preamble round ==========

    // Add vk hash to transcript
    transcript->add_to_hash_buffer("avm_vk_hash", key->get_hash());

    info("AVM vk hash in recursive verifier: ", key->get_hash().get_value());

    // ========== Execute public inputs round ==========

    // Validate number of public input columns
    if (public_inputs.size() != AVM_NUM_PUBLIC_INPUT_COLUMNS) {
        throw_or_abort("AvmRecursiveVerifier::verify_proof: public inputs size mismatch");
    }

    // Add public inputs to transcript. This ensures that the Sumcheck challenge depends both on the public inputs sent
    // in the clear and on the committed columns.
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        if (public_inputs[i].size() != AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH) {
            throw_or_abort("AvmRecursiveVerifier::verify_proof: public input size mismatch");
        }
        for (size_t j = 0; j < public_inputs[i].size(); j++) {
            transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
                                           public_inputs[i][j]);
        }
    }

    // ========== Execute wire commitments round ==========

    constexpr size_t BS = Flavor::NativeFlavor::INTERLEAVING_BATCH_SIZE;

    // Receive wire group commitments
    std::vector<Commitment> wire_group_comms(Flavor::NativeFlavor::NUM_WIRE_GROUPS);
    for (size_t g = 0; g < Flavor::NativeFlavor::NUM_WIRE_GROUPS; g++) {
        wire_group_comms[g] = transcript->template receive_from_prover<Commitment>("WIRE_GROUP_" + std::to_string(g));
    }

    VerifierCommitments commitments{ key };

    // ========== Execute log derivative inverse round ==========

    // Generate randomness required by Lookup and Permutation relations
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Receive derived group commitments
    std::vector<Commitment> derived_group_comms(Flavor::NativeFlavor::NUM_DERIVED_GROUPS);
    for (size_t g = 0; g < Flavor::NativeFlavor::NUM_DERIVED_GROUPS; g++) {
        derived_group_comms[g] =
            transcript->template receive_from_prover<Commitment>("DERIVED_GROUP_" + std::to_string(g));
    }

    // ========== Execute relation check rounds ==========

    // Construct padding indicator array: it is a vector of constant ones as the AVM verifier performs verification of
    // the AVM circuit, so the number of rounds is fixed.
    std::vector<FF> padding_indicator_array(MAX_AVM_TRACE_LOG_SIZE, FF(1));

    // Multiply each linearly independent subrelation contribution by `alpha^i` for i = 0, ..., NUM_SUBRELATIONS - 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    SumcheckVerifier<Flavor> sumcheck(transcript, alpha, MAX_AVM_TRACE_LOG_SIZE);

    std::vector<FF> gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", MAX_AVM_TRACE_LOG_SIZE);

    SumcheckOutput<Flavor> output = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator_array);
    vinfo("verified sumcheck: ", (output.verified));

    // Validate that the public inputs committed in the public input columns match the public inputs sent in the clear
    // by the Prover
    using C = ColumnAndShifts;
    std::array<FF, AVM_NUM_PUBLIC_INPUT_COLUMNS> claimed_evaluations = {
        output.claimed_evaluations.get(C::public_inputs_cols_0_),
        output.claimed_evaluations.get(C::public_inputs_cols_1_),
        output.claimed_evaluations.get(C::public_inputs_cols_2_),
        output.claimed_evaluations.get(C::public_inputs_cols_3_),
    };

    // Validate public inputs match the claimed evaluations
    for (size_t idx = 0;
         const auto& [public_input_column, claimed_evaluation] : zip_view(public_inputs, claimed_evaluations)) {
        FF public_input_evaluation = evaluate_public_input_column(public_input_column, output.challenge);
        public_input_evaluation.assert_equal(claimed_evaluation,
                                             format("public_input_evaluation failed at column ", idx));
        idx++;
    }

    // ========== Execute PCS verification ==========

    // Get short batching challenges from transcript (per individual entity)
    Challenges challenges;
    auto unshifted_challenges_vec = transcript->template get_challenges<FF>(challenges.get_unshifted_labels());
    std::ranges::move(unshifted_challenges_vec, challenges.get_unshifted().begin());
    auto unshifted_challenges = challenges.get_unshifted();
    auto shifted_challenges = challenges.get_to_be_shifted();

    // Get individual entity evaluations from sumcheck
    auto unshifted_evals = output.claimed_evaluations.get_unshifted();
    auto shifted_evals = output.claimed_evaluations.get_shifted();

    // ---- Combine per-entity challenges/evaluations into per-group values ----

    // Get interleaving challenges (0 for BS=1)
    std::vector<FF> interleaving_challenges;
    for (size_t i = 0; i < Flavor::NativeFlavor::INTERLEAVING_LOG_K; i++) {
        interleaving_challenges.push_back(
            transcript->template get_challenge<FF>("interleaving_challenge_" + std::to_string(i)));
    }
    auto lagrange = compute_interleaving_lagrange_basis<BS>(
        std::span<const FF>(interleaving_challenges.data(), interleaving_challenges.size()));

    auto combine_section = [&](std::span<const FF> entity_values, size_t num_groups) {
        std::vector<FF> group_values(num_groups, FF(0));
        for (size_t g = 0; g < num_groups; g++) {
            for (size_t j = 0; j < BS && g * BS + j < entity_values.size(); j++) {
                group_values[g] += entity_values[g * BS + j] * lagrange[j];
            }
        }
        return group_values;
    };

    auto concat_vectors = [](auto&&... vecs) {
        std::vector<FF> result;
        (result.insert(result.end(), vecs.begin(), vecs.end()), ...);
        return result;
    };

    // Wire section needs zero-padding before shifted wires for BS-alignment (PAD=0 for BS=1).
    constexpr size_t NUM_PRECOMPUTED = Flavor::NativeFlavor::NUM_PRECOMPUTED_ENTITIES;
    constexpr size_t NUM_WIRES = Flavor::NativeFlavor::NUM_WIRES;
    constexpr size_t NUM_DERIVED = Flavor::NativeFlavor::NUM_WITNESS_ENTITIES - Flavor::NativeFlavor::NUM_WIRES;
    constexpr size_t PAD = Flavor::NativeFlavor::NUM_SHIFT_ALIGNMENT_PADDING;
    constexpr size_t NON_SHIFTED_WIRES = bb::avm2::NUM_NON_SHIFTED_WIRES;

    auto pad_wire_values = [&](std::span<const FF> wire_vals) {
        std::vector<FF> padded;
        padded.reserve(wire_vals.size() + PAD);
        padded.insert(padded.end(), wire_vals.begin(), wire_vals.begin() + NON_SHIFTED_WIRES);
        padded.resize(padded.size() + PAD, FF(0));
        padded.insert(padded.end(), wire_vals.begin() + NON_SHIFTED_WIRES, wire_vals.end());
        return padded;
    };

    auto padded_wire_challenges = pad_wire_values(unshifted_challenges.subspan(NUM_PRECOMPUTED, NUM_WIRES));
    auto padded_wire_evals = pad_wire_values(unshifted_evals.subspan(NUM_PRECOMPUTED, NUM_WIRES));

    auto group_unshifted_challenges = concat_vectors(
        combine_section(unshifted_challenges.subspan(0, NUM_PRECOMPUTED), Flavor::NativeFlavor::NUM_PRECOMPUTED_GROUPS),
        combine_section(std::span<const FF>(padded_wire_challenges), Flavor::NativeFlavor::NUM_WIRE_GROUPS),
        combine_section(unshifted_challenges.subspan(NUM_PRECOMPUTED + NUM_WIRES, NUM_DERIVED),
                        Flavor::NativeFlavor::NUM_DERIVED_GROUPS));
    auto group_shifted_challenges = combine_section(shifted_challenges, Flavor::NativeFlavor::NUM_SHIFTED_GROUPS);

    auto group_unshifted_evals = concat_vectors(
        combine_section(unshifted_evals.subspan(0, NUM_PRECOMPUTED), Flavor::NativeFlavor::NUM_PRECOMPUTED_GROUPS),
        combine_section(std::span<const FF>(padded_wire_evals), Flavor::NativeFlavor::NUM_WIRE_GROUPS),
        combine_section(unshifted_evals.subspan(NUM_PRECOMPUTED + NUM_WIRES, NUM_DERIVED),
                        Flavor::NativeFlavor::NUM_DERIVED_GROUPS));
    auto group_shifted_evals = combine_section(shifted_evals, Flavor::NativeFlavor::NUM_SHIFTED_GROUPS);

    // ---- Collect group commitments ----

    std::vector<Commitment> all_unshifted_group_comms;
    all_unshifted_group_comms.reserve(Flavor::NativeFlavor::NUM_UNSHIFTED_GROUPS);
    for (size_t g = 0; g < Flavor::NativeFlavor::NUM_PRECOMPUTED_GROUPS; g++) {
        all_unshifted_group_comms.push_back(key->precomputed_group_commitments[g]);
    }
    for (auto& c : wire_group_comms) {
        all_unshifted_group_comms.push_back(c);
    }
    for (auto& c : derived_group_comms) {
        all_unshifted_group_comms.push_back(c);
    }

    // Shifted group commitments = subset of wire groups (with padding offset)
    constexpr size_t SHIFTED_WIRE_OFFSET = (WIRES_TO_BE_SHIFTED_START_IDX - WIRE_START_IDX) + PAD;
    constexpr size_t SHIFTED_WIRE_END_OFFSET = (WIRES_TO_BE_SHIFTED_END_IDX - WIRE_START_IDX) + PAD;
    constexpr size_t SHIFTED_WIRE_GROUP_START = SHIFTED_WIRE_OFFSET / BS;
    constexpr size_t SHIFTED_WIRE_GROUP_END = (SHIFTED_WIRE_END_OFFSET + BS - 1) / BS;
    std::vector<Commitment> shifted_group_comms;
    for (size_t g = SHIFTED_WIRE_GROUP_START; g < SHIFTED_WIRE_GROUP_END; g++) {
        shifted_group_comms.push_back(wire_group_comms[g]);
    }

    // ---- Batch commitments and evaluations ----

    Commitment batched_shifted_group = Commitment::batch_mul(shifted_group_comms, group_shifted_challenges, 128);

    std::vector<Commitment> non_shifted_comms;
    std::vector<FF> non_shifted_challenges;
    for (size_t g = 0; g < Flavor::NativeFlavor::NUM_UNSHIFTED_GROUPS; g++) {
        size_t wire_group_idx = g - Flavor::NativeFlavor::NUM_PRECOMPUTED_GROUPS;
        bool is_wire_group = g >= Flavor::NativeFlavor::NUM_PRECOMPUTED_GROUPS &&
                             g < Flavor::NativeFlavor::NUM_PRECOMPUTED_GROUPS + Flavor::NativeFlavor::NUM_WIRE_GROUPS;
        bool is_shifted_group =
            is_wire_group && wire_group_idx >= SHIFTED_WIRE_GROUP_START && wire_group_idx < SHIFTED_WIRE_GROUP_END;
        if (!is_shifted_group) {
            non_shifted_comms.push_back(all_unshifted_group_comms[g]);
            non_shifted_challenges.push_back(group_unshifted_challenges[g]);
        }
    }
    Commitment batched_unshifted_group =
        batched_shifted_group + Commitment::batch_mul(non_shifted_comms, non_shifted_challenges, 128);

    FF batched_unshifted_eval = std::inner_product(
        group_unshifted_challenges.begin(), group_unshifted_challenges.end(), group_unshifted_evals.begin(), FF(0));
    FF batched_shifted_eval = std::inner_product(
        group_shifted_challenges.begin(), group_shifted_challenges.end(), group_shifted_evals.begin(), FF(0));

    // ---- PCS opening ----

    // Extended challenge: [interleaving_challenges || sumcheck_challenges]
    std::vector<FF> extended_challenge;
    extended_challenge.reserve(Flavor::NativeFlavor::INTERLEAVING_LOG_K + output.challenge.size());
    for (const auto& ic : interleaving_challenges) {
        extended_challenge.push_back(ic);
    }
    extended_challenge.insert(extended_challenge.end(), output.challenge.begin(), output.challenge.end());
    std::vector<FF> extended_padding(extended_challenge.size(), FF(1));

    ClaimBatcher batched_claim_batcher{ .shift_exponent = BS,
                                        .unshifted = ClaimBatch{ .commitments = RefVector(batched_unshifted_group),
                                                                 .evaluations = RefVector(batched_unshifted_eval) },
                                        .shifted = ClaimBatch{ .commitments = RefVector(batched_shifted_group),
                                                               .evaluations = RefVector(batched_shifted_eval) } };

    auto opening_claim =
        Shplemini::compute_batch_opening_claim(
            extended_padding, batched_claim_batcher, extended_challenge, Commitment::one(&builder), transcript)
            .batch_opening_claim;

    PairingPoints pairing_points(PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript));

    if (builder.failed()) {
        info("AVM Recursive verifier builder failed with error: ", builder.err());
    }

    is_verification_complete = true;

    return pairing_points;
}

AvmRecursiveVerifier::FF AvmRecursiveVerifier::hash_avm_transcript(const stdlib::Proof<Builder>& stdlib_proof)
{
    if (!is_verification_complete) {
        throw_or_abort("Transcript can only be hashed after verification is complete");
    }
    return Transcript::hash_avm_transcript(transcript, stdlib_proof);
};

} // namespace bb::avm2
