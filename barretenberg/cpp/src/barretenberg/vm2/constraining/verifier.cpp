// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#include "barretenberg/vm2/constraining/verifier.hpp"

#include "barretenberg/commitment_schemes/interleaving_utils.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include <numeric>

namespace bb::avm2 {

AvmVerifier::AvmVerifier(AvmVerifier&& other) noexcept
    : key(std::move(other.key))
    , transcript(std::move(other.transcript))
{}

AvmVerifier& AvmVerifier::operator=(AvmVerifier&& other) noexcept
{
    key = other.key;
    transcript = other.transcript;
    return *this;
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
AvmVerifier::FF AvmVerifier::evaluate_public_input_column(const std::vector<FF>& points,
                                                          const std::vector<FF>& challenges)
{
    Polynomial<FF> polynomial(points, MAX_AVM_TRACE_SIZE);
    return polynomial.evaluate_mle(challenges);
}

/**
 * @brief Verify an AVM proof
 *
 */
bool AvmVerifier::verify_proof(const HonkProof& proof, const std::vector<std::vector<FF>>& public_inputs)
{
    using PCS = Flavor::PCS;
    using Curve = Flavor::Curve;
    using VerifierCommitments = Flavor::VerifierCommitments;
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using Challenges = Flavor::AllEntities<FF>;

    RelationParameters<FF> relation_parameters;

    transcript->load_proof(proof);

    // ========== Execute preamble round ==========

    // Add vk hash to transcript
    FF vk_hash = key->get_hash();
    transcript->add_to_hash_buffer("avm_vk_hash", vk_hash);
    vinfo("AVM vk hash in verifier: ", vk_hash);

    // ========== Execute public inputs round ==========

    // Validate number of public input columns
    if (public_inputs.size() != AVM_NUM_PUBLIC_INPUT_COLUMNS) {
        vinfo("Public inputs size mismatch");
        return false;
    }

    // Add public inputs to transcript. This ensures that the Sumcheck challenge depends both on the public inputs sent
    // in the clear and on the committed columns.
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        // Validate public input column size
        if (public_inputs[i].size() != AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH) {
            vinfo("Public input size mismatch");
            return false;
        }
        for (size_t j = 0; j < public_inputs[i].size(); j++) {
            transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
                                           public_inputs[i][j]);
        }
    }

    // ========== Execute wire commitments round ==========

    constexpr size_t BS = Flavor::INTERLEAVING_BATCH_SIZE;

    // Receive wire group commitments
    std::vector<Commitment> wire_group_comms(Flavor::NUM_WIRE_GROUPS);
    for (size_t g = 0; g < Flavor::NUM_WIRE_GROUPS; g++) {
        wire_group_comms[g] = transcript->template receive_from_prover<Commitment>("WIRE_GROUP_" + std::to_string(g));
    }

    // Also populate per-entity commitments in VerifierCommitments for sumcheck
    // (sumcheck uses individual entity evaluations, but we only have group commitments)
    VerifierCommitments commitments{ key };

    // ========== Execute log derivative inverse round ==========

    // Generate randomness required by Lookup and Permutation relations
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Receive derived group commitments
    std::vector<Commitment> derived_group_comms(Flavor::NUM_DERIVED_GROUPS);
    for (size_t g = 0; g < Flavor::NUM_DERIVED_GROUPS; g++) {
        derived_group_comms[g] =
            transcript->template receive_from_prover<Commitment>("DERIVED_GROUP_" + std::to_string(g));
    }

    // ========== Execute relation check rounds ==========

    // Construct padding indicator array: it is a vector of constant ones as the AVM verifier performs verification of
    // the AVM circuit, so the number of rounds is fixed.
    std::vector<FF> padding_indicator_array(MAX_AVM_TRACE_LOG_SIZE, 1);

    // Multiply each linearly independent subrelation contribution by `alpha^i` for i = 0, ..., NUM_SUBRELATIONS - 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    SumcheckVerifier<Flavor> sumcheck(transcript, alpha, MAX_AVM_TRACE_LOG_SIZE);

    // Get the gate challenges for sumcheck computation
    std::vector<FF> gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", MAX_AVM_TRACE_LOG_SIZE);
    SumcheckOutput<Flavor> output = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator_array);

    // If Sumcheck did not verify, return false
    if (!output.verified) {
        vinfo("Sumcheck verification failed");
        return false;
    }

    // Validate that the public inputs committed in the public input columns match the public inputs sent in the clear
    // by the Prover
    using C = ColumnAndShifts;
    std::array<FF, AVM_NUM_PUBLIC_INPUT_COLUMNS> claimed_evaluations = {
        output.claimed_evaluations.get(C::public_inputs_cols_0_),
        output.claimed_evaluations.get(C::public_inputs_cols_1_),
        output.claimed_evaluations.get(C::public_inputs_cols_2_),
        output.claimed_evaluations.get(C::public_inputs_cols_3_),
    };
    for (size_t idx = 0;
         const auto& [public_input_column, claimed_evaluation] : zip_view(public_inputs, claimed_evaluations)) {
        FF public_input_evaluation = evaluate_public_input_column(public_input_column, output.challenge);
        if (public_input_evaluation != claimed_evaluation) {
            vinfo("public_input_evaluation failed, public inputs col ", idx);
            return false;
        }
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
    std::span<const FF> unshifted_evals = output.claimed_evaluations.get_unshifted();
    std::span<const FF> shifted_evals = output.claimed_evaluations.get_shifted();

    if constexpr (BS == 1) {
        // Non-interleaved path: original logic
        // Build per-entity commitments from group commitments (groups of 1 = identity)
        // Wire group commitments are individual wire commitments
        for (size_t i = 0; i < Flavor::NUM_WIRE_GROUPS; i++) {
            commitments.get_wires()[i] = wire_group_comms[i];
        }
        for (size_t i = 0; i < Flavor::NUM_DERIVED_GROUPS; i++) {
            commitments.get_derived()[i] = derived_group_comms[i];
        }

        std::span<const Commitment> unshifted_comms = commitments.get_unshifted();
        std::span<const Commitment> shifted_comms = commitments.get_to_be_shifted();

        Commitment batched_shifted = Commitment::batch_mul(shifted_comms, shifted_challenges);
        Commitment batched_unshifted =
            batched_shifted +
            Commitment::batch_mul(unshifted_comms.subspan(0, WIRES_TO_BE_SHIFTED_START_IDX),
                                  unshifted_challenges.subspan(0, WIRES_TO_BE_SHIFTED_START_IDX)) +
            Commitment::batch_mul(unshifted_comms.subspan(WIRES_TO_BE_SHIFTED_END_IDX),
                                  unshifted_challenges.subspan(WIRES_TO_BE_SHIFTED_END_IDX));

        FF batched_unshifted_eval = std::inner_product(
            unshifted_challenges.begin(), unshifted_challenges.end(), unshifted_evals.begin(), FF(0));
        FF batched_shifted_eval =
            std::inner_product(shifted_challenges.begin(), shifted_challenges.end(), shifted_evals.begin(), FF(0));

        ClaimBatcher batched_claim_batcher{ .unshifted = ClaimBatch{ .commitments = RefVector(batched_unshifted),
                                                                     .evaluations = RefVector(batched_unshifted_eval) },
                                            .shifted = ClaimBatch{ .commitments = RefVector(batched_shifted),
                                                                   .evaluations = RefVector(batched_shifted_eval) } };
        auto opening_claim =
            Shplemini::compute_batch_opening_claim(
                padding_indicator_array, batched_claim_batcher, output.challenge, Commitment::one(), transcript)
                .batch_opening_claim;

        const auto pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);
        const auto shplemini_verified = pairing_points.check();
        if (!shplemini_verified) {
            vinfo("Shplemini verification failed");
            return false;
        }
    } else {
        // Interleaved path: combine evaluations using Lagrange basis, batch group commitments

        // Get interleaving challenges (Fiat-Shamir, same as prover)
        std::vector<FF> interleaving_challenges;
        for (size_t i = 0; i < Flavor::INTERLEAVING_LOG_K; i++) {
            interleaving_challenges.push_back(
                transcript->template get_challenge<FF>("interleaving_challenge_" + std::to_string(i)));
        }

        auto lagrange = compute_interleaving_lagrange_basis<BS>(
            std::span<const FF>(interleaving_challenges.data(), interleaving_challenges.size()));

        // Combine per-entity values into per-group values using Lagrange basis.
        // IMPORTANT: Must respect section boundaries. Entity counts may not be divisible by BS,
        // so the last group in each section may have fewer than BS entities (zero-padded).
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

        // Split unshifted challenges/evals by section to avoid cross-section boundary issues.
        // Wire section needs zero-padding before shifted wires for BS-alignment.
        constexpr size_t NUM_PRECOMPUTED = Flavor::NUM_PRECOMPUTED_ENTITIES;
        constexpr size_t NUM_WIRES = Flavor::NUM_WIRES;
        constexpr size_t NUM_DERIVED = Flavor::NUM_WITNESS_ENTITIES - Flavor::NUM_WIRES;
        constexpr size_t PAD = Flavor::NUM_SHIFT_ALIGNMENT_PADDING;
        constexpr size_t NON_SHIFTED_WIRES = bb::avm2::NUM_NON_SHIFTED_WIRES;

        // Helper to build padded wire values: [non-shifted | PAD zeros | shifted]
        auto pad_wire_values = [&](std::span<const FF> wire_vals) {
            std::vector<FF> padded;
            padded.reserve(wire_vals.size() + PAD);
            padded.insert(padded.end(), wire_vals.begin(), wire_vals.begin() + NON_SHIFTED_WIRES);
            padded.resize(padded.size() + PAD, FF(0));
            padded.insert(padded.end(), wire_vals.begin() + NON_SHIFTED_WIRES, wire_vals.end());
            return padded;
        };

        auto wire_challenges_raw = unshifted_challenges.subspan(NUM_PRECOMPUTED, NUM_WIRES);
        auto wire_evals_raw = unshifted_evals.subspan(NUM_PRECOMPUTED, NUM_WIRES);
        auto padded_wire_challenges = pad_wire_values(wire_challenges_raw);
        auto padded_wire_evals = pad_wire_values(wire_evals_raw);

        auto group_unshifted_challenges = concat_vectors(
            combine_section(unshifted_challenges.subspan(0, NUM_PRECOMPUTED), Flavor::NUM_PRECOMPUTED_GROUPS),
            combine_section(std::span<const FF>(padded_wire_challenges), Flavor::NUM_WIRE_GROUPS),
            combine_section(unshifted_challenges.subspan(NUM_PRECOMPUTED + NUM_WIRES, NUM_DERIVED),
                            Flavor::NUM_DERIVED_GROUPS));
        auto group_shifted_challenges = combine_section(shifted_challenges, Flavor::NUM_SHIFTED_GROUPS);

        auto group_unshifted_evals =
            concat_vectors(combine_section(unshifted_evals.subspan(0, NUM_PRECOMPUTED), Flavor::NUM_PRECOMPUTED_GROUPS),
                           combine_section(std::span<const FF>(padded_wire_evals), Flavor::NUM_WIRE_GROUPS),
                           combine_section(unshifted_evals.subspan(NUM_PRECOMPUTED + NUM_WIRES, NUM_DERIVED),
                                           Flavor::NUM_DERIVED_GROUPS));
        auto group_shifted_evals = combine_section(shifted_evals, Flavor::NUM_SHIFTED_GROUPS);

        // Collect all unshifted group commitments: precomputed (from VK) + wire + derived
        std::vector<Commitment> all_unshifted_group_comms;
        all_unshifted_group_comms.reserve(Flavor::NUM_UNSHIFTED_GROUPS);
        // Precomputed group commitments from VK (committed via commit_interleaved)
        for (size_t g = 0; g < Flavor::NUM_PRECOMPUTED_GROUPS; g++) {
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

        // Batch group commitments with group challenges
        Commitment batched_shifted_group = Commitment::batch_mul(shifted_group_comms, group_shifted_challenges);

        // Batch unshifted group commitments, reusing shifted contribution
        // Skip shifted wire groups since they're already included
        std::vector<Commitment> non_shifted_comms;
        std::vector<FF> non_shifted_challenges;
        for (size_t g = 0; g < Flavor::NUM_UNSHIFTED_GROUPS; g++) {
            size_t wire_group_idx = g - Flavor::NUM_PRECOMPUTED_GROUPS;
            bool is_wire_group =
                g >= Flavor::NUM_PRECOMPUTED_GROUPS && g < Flavor::NUM_PRECOMPUTED_GROUPS + Flavor::NUM_WIRE_GROUPS;
            bool is_shifted_group =
                is_wire_group && wire_group_idx >= SHIFTED_WIRE_GROUP_START && wire_group_idx < SHIFTED_WIRE_GROUP_END;
            if (!is_shifted_group) {
                non_shifted_comms.push_back(all_unshifted_group_comms[g]);
                non_shifted_challenges.push_back(group_unshifted_challenges[g]);
            }
        }
        Commitment batched_unshifted_group =
            batched_shifted_group + Commitment::batch_mul(non_shifted_comms, non_shifted_challenges);

        // Batch evaluations
        FF batched_unshifted_eval = std::inner_product(
            group_unshifted_challenges.begin(), group_unshifted_challenges.end(), group_unshifted_evals.begin(), FF(0));
        FF batched_shifted_eval = std::inner_product(
            group_shifted_challenges.begin(), group_shifted_challenges.end(), group_shifted_evals.begin(), FF(0));

        // Build extended multilinear challenge: interleaving challenges FIRST, then sumcheck challenges.
        // Interleaving variables correspond to the LOWEST bits of the group poly index
        // (they select position j within a BS-sized group), so they come FIRST.
        std::vector<FF> extended_challenge;
        extended_challenge.reserve(Flavor::INTERLEAVING_LOG_K + output.challenge.size());
        for (const auto& ic : interleaving_challenges) {
            extended_challenge.push_back(ic);
        }
        extended_challenge.insert(extended_challenge.end(), output.challenge.begin(), output.challenge.end());

        // Extend padding indicator array for the extra interleaving rounds
        std::vector<FF> extended_padding(extended_challenge.size(), 1);

        ClaimBatcher batched_claim_batcher{ .shift_exponent = BS,
                                            .unshifted = ClaimBatch{ .commitments = RefVector(batched_unshifted_group),
                                                                     .evaluations = RefVector(batched_unshifted_eval) },
                                            .shifted = ClaimBatch{ .commitments = RefVector(batched_shifted_group),
                                                                   .evaluations = RefVector(batched_shifted_eval) } };

        auto opening_claim =
            Shplemini::compute_batch_opening_claim(
                extended_padding, batched_claim_batcher, extended_challenge, Commitment::one(), transcript)
                .batch_opening_claim;

        const auto pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);
        const auto shplemini_verified = pairing_points.check();
        if (!shplemini_verified) {
            vinfo("Shplemini verification failed");
            return false;
        }
    }

    return true;
}

} // namespace bb::avm2
