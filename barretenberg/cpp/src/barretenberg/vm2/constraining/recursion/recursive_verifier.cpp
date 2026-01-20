// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "recursive_verifier.hpp"

#include <algorithm>
#include <cstddef>
#include <memory>
#include <numeric>

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

AvmRecursiveVerifier::AvmRecursiveVerifier(Builder& builder, const std::shared_ptr<Transcript>& transcript)
    : builder(builder)
    , transcript(transcript)
{
    auto native_vk = std::make_shared<NativeVerificationKey>(constraining::AvmFixedVKCommitments::get_all());

    key = std::make_shared<VerificationKey>(&builder, native_vk);
    key->fix_witness();

    auto native_vk_hash = native_vk->hash();
    vk_hash = FF::from_witness(&builder, native_vk_hash);
    vk_hash.fix_witness();
}

// Evaluate the given public input column over the multivariate challenge points
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

AvmRecursiveVerifier::PairingPoints AvmRecursiveVerifier::verify_proof(
    const stdlib::Proof<Builder>& stdlib_proof, const std::vector<std::vector<FF>>& public_inputs)
{
    using RelationParams = RelationParameters<typename Flavor::FF>;
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using Challenges = Flavor::NativeFlavor::AllEntities<FF>;

    if (public_inputs.size() != AVM_NUM_PUBLIC_INPUT_COLUMNS) {
        throw_or_abort("AvmRecursiveVerifier::verify_proof: public inputs size mismatch");
    }
    for (const auto& public_input : public_inputs) {
        if (public_input.size() != AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH) {
            throw_or_abort("AvmRecursiveVerifier::verify_proof: public input size mismatch");
        }
    }

    transcript->load_proof(stdlib_proof);

    transcript->add_to_hash_buffer("avm_vk_hash", vk_hash);

    info("AVM vk hash in recursive verifier: ", vk_hash.get_value());

    RelationParams relation_parameters;
    VerifierCommitments commitments{ key };

    // Add public inputs to transcript for Fiat-Shamir
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        for (size_t j = 0; j < public_inputs[i].size(); j++) {
            transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
                                           public_inputs[i][j]);
        }
    }
    // Get commitments to VM wires
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitments.get_wires_labels())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Get commitments to inverses
    for (auto [commitment, label] : zip_view(commitments.get_derived(), commitments.get_derived_labels())) {
        commitment = transcript->template receive_from_prover<Commitment>(label);
    }

    std::vector<FF> padding_indicator_array(MAX_AVM_TRACE_LOG_SIZE, FF(1));

    // Multiply each linearly independent subrelation contribution by `alpha^i` for i = 0, ..., NUM_SUBRELATIONS - 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    SumcheckVerifier<Flavor> sumcheck(transcript, alpha, MAX_AVM_TRACE_LOG_SIZE);

    std::vector<FF> gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", MAX_AVM_TRACE_LOG_SIZE);

    // No need to constrain that sumcheck_verified is true as this is guaranteed by the implementation of
    // when called over a "circuit field" types.
    SumcheckOutput<Flavor> output = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator_array);
    vinfo("verified sumcheck: ", (output.verified));

    using C = ColumnAndShifts;
    std::array<FF, AVM_NUM_PUBLIC_INPUT_COLUMNS> claimed_evaluations = {
        output.claimed_evaluations.get(C::public_inputs_cols_0_),
        output.claimed_evaluations.get(C::public_inputs_cols_1_),
        output.claimed_evaluations.get(C::public_inputs_cols_2_),
        output.claimed_evaluations.get(C::public_inputs_cols_3_),
    };

    // Validate public inputs match the claimed evaluations
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        FF public_input_evaluation = evaluate_public_input_column(public_inputs[i], output.challenge);
        public_input_evaluation.assert_equal(claimed_evaluations[i],
                                             format("public_input_evaluation failed at column ", i));
    }

    // Batch commitments and evaluations using short scalars to reduce ECCVM circuit size
    auto unshifted_comms = commitments.get_unshifted();
    auto unshifted_evals = output.claimed_evaluations.get_unshifted();
    auto shifted_comms = commitments.get_to_be_shifted();
    auto shifted_evals = output.claimed_evaluations.get_shifted();

    // Get short batching challenges from transcript
    Challenges challenges;
    auto unshifted_challenges_vec = transcript->template get_challenges<FF>(challenges.get_unshifted_labels());
    std::ranges::move(unshifted_challenges_vec, challenges.get_unshifted().begin());
    auto unshifted_challenges = challenges.get_unshifted();
    auto shifted_challenges = challenges.get_to_be_shifted();

    // Batch commitments: first commitment has coefficient 1, rest are batched with challenges
    Commitment squashed_shifted =
        Commitment::batch_mul(std::vector<Commitment>(shifted_comms.begin(), shifted_comms.end()),
                              std::vector<FF>(shifted_challenges.begin(), shifted_challenges.end()),
                              128);

    Commitment squashed_unshifted =
        unshifted_comms[0] +
        Commitment::batch_mul(std::vector<Commitment>(unshifted_comms.begin() + 1,
                                                      unshifted_comms.begin() + WIRES_TO_BE_SHIFTED_START_IDX),
                              std::vector<FF>(unshifted_challenges.begin() + 1,
                                              unshifted_challenges.begin() + WIRES_TO_BE_SHIFTED_START_IDX),
                              128) +
        Commitment::batch_mul(
            std::vector<Commitment>(unshifted_comms.begin() + WIRES_TO_BE_SHIFTED_END_IDX, unshifted_comms.end()),
            std::vector<FF>(unshifted_challenges.begin() + WIRES_TO_BE_SHIFTED_END_IDX, unshifted_challenges.end()),
            128) +
        squashed_shifted;

    // Batch evaluations: compute inner product with first eval as initial value for unshifted
    FF squashed_unshifted_eval = std::inner_product(
        unshifted_challenges.begin() + 1, unshifted_challenges.end(), unshifted_evals.begin() + 1, unshifted_evals[0]);

    FF squashed_shifted_eval =
        std::inner_product(shifted_challenges.begin(), shifted_challenges.end(), shifted_evals.begin(), FF(0));

    // Execute Shplemini rounds with squashed claims
    ClaimBatcher squashed_claim_batcher{ .unshifted = ClaimBatch{ .commitments = RefVector(squashed_unshifted),
                                                                  .evaluations = RefVector(squashed_unshifted_eval) },
                                         .shifted = ClaimBatch{ .commitments = RefVector(squashed_shifted),
                                                                .evaluations = RefVector(squashed_shifted_eval) } };
    auto opening_claim =
        Shplemini::compute_batch_opening_claim(
            padding_indicator_array, squashed_claim_batcher, output.challenge, Commitment::one(&builder), transcript)
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
    BB_ASSERT(is_verification_complete, "Transcript can only be hashed after verification is complete");
    return Transcript::hash_avm_transcript(transcript, stdlib_proof);
};

} // namespace bb::avm2
