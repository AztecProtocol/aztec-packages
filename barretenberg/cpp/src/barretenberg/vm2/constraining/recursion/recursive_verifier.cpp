// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
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

    // Receive commitments to all polynomials except the logderivate ones
    VerifierCommitments commitments{ key };
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitments.get_wires_labels())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // ========== Execute log derivative inverse round ==========

    // Generate randomness required by Lookup and Permutation relations
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Receive commitments to all logderivative inverse polynomials
    for (auto [commitment, label] : zip_view(commitments.get_derived(), commitments.get_derived_labels())) {
        commitment = transcript->template receive_from_prover<Commitment>(label);
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

    // Batch commitments and evaluations using short scalars to reduce ECCVM circuit size
    auto unshifted_comms = commitments.get_unshifted();
    auto unshifted_evals = output.claimed_evaluations.get_unshifted();
    auto shifted_comms = commitments.get_to_be_shifted();
    auto shifted_evals = output.claimed_evaluations.get_shifted();

    // Get short batching challenges from transcript
    // Note: the challenge for ColumnAndShifts::precomputed_clk is not used for batching, but to maintain the code
    // cleaner, we generate it nonetheless
    Challenges challenges;
    auto unshifted_challenges_vec = transcript->template get_challenges<FF>(challenges.get_unshifted_labels());
    std::ranges::move(unshifted_challenges_vec, challenges.get_unshifted().begin());
    challenges.get(ColumnAndShifts::precomputed_clk) = FF(1);
    auto unshifted_challenges = challenges.get_unshifted();
    auto shifted_challenges = challenges.get_to_be_shifted();

    // Batch to be shifted commitments
    Commitment batched_shifted =
        Commitment::batch_mul(std::vector<Commitment>(shifted_comms.begin(), shifted_comms.end()),
                              std::vector<FF>(shifted_challenges.begin(), shifted_challenges.end()),
                              128);

    // Batch unshifted commitments: ColumnAndShifts::precomputed_clk has coefficient 1, rest are batched with
    // challenges. We reuse the calculation performed for shifted commitments.
    Commitment batched_unshifted =
        Commitment::batch_mul(
            std::vector<Commitment>(unshifted_comms.begin(), unshifted_comms.begin() + WIRES_TO_BE_SHIFTED_START_IDX),
            std::vector<FF>(unshifted_challenges.begin(), unshifted_challenges.begin() + WIRES_TO_BE_SHIFTED_START_IDX),
            128) +
        Commitment::batch_mul(
            std::vector<Commitment>(unshifted_comms.begin() + WIRES_TO_BE_SHIFTED_END_IDX, unshifted_comms.end()),
            std::vector<FF>(unshifted_challenges.begin() + WIRES_TO_BE_SHIFTED_END_IDX, unshifted_challenges.end()),
            128) +
        batched_shifted;

    // Batch evaluations
    FF batched_unshifted_eval =
        std::inner_product(unshifted_challenges.begin(), unshifted_challenges.end(), unshifted_evals.begin(), FF(0));

    FF batched_shifted_eval =
        std::inner_product(shifted_challenges.begin(), shifted_challenges.end(), shifted_evals.begin(), FF(0));

    // Execute Shplemini rounds with batched claims
    ClaimBatcher batched_claim_batcher{ .unshifted = ClaimBatch{ .commitments = RefVector(batched_unshifted),
                                                                 .evaluations = RefVector(batched_unshifted_eval) },
                                        .shifted = ClaimBatch{ .commitments = RefVector(batched_shifted),
                                                               .evaluations = RefVector(batched_shifted_eval) } };
    auto opening_claim =
        Shplemini::compute_batch_opening_claim(
            padding_indicator_array, batched_claim_batcher, output.challenge, Commitment::one(&builder), transcript)
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
