#include "recursive_verifier.hpp"

#include <algorithm>
#include <cstddef>
#include <memory>

#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/shared_shifted_virtual_zeroes_array.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"

namespace bb::avm2 {

// TODO(#15892): Remove vk argument from all functions once its fixed.
AvmRecursiveVerifier::AvmRecursiveVerifier(Builder& builder, const std::shared_ptr<VerificationKey>& vkey)
    : builder(builder)
    , key(vkey)
{
    // TODO(#15892): Uncomment this when we make the AVM vk and vk
    // hash fixed.
    // key->fix_witness();
    // compute the vk hash from the native vk fields
    // this->vk_hash.fix_witness();
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
    const HonkProof& proof, const std::vector<std::vector<fr>>& public_inputs_vec_nt)
{
    StdlibProof stdlib_proof(builder, proof);

    std::vector<std::vector<FF>> public_inputs_ct;
    public_inputs_ct.reserve(public_inputs_vec_nt.size());

    for (const auto& vec : public_inputs_vec_nt) {
        std::vector<FF> vec_ct;
        vec_ct.reserve(vec.size());
        for (const auto& el : vec) {
            vec_ct.push_back(stdlib::witness_t<Builder>(&builder, el));
        }
        public_inputs_ct.push_back(vec_ct);
    }

    return verify_proof(stdlib_proof, public_inputs_ct);
}

// TODO(#991): (see https://github.com/AztecProtocol/barretenberg/issues/991)
// TODO(#14234)[Unconditional PIs validation]: rename stdlib_proof_with_pi_flag to stdlib_proof
AvmRecursiveVerifier::PairingPoints AvmRecursiveVerifier::verify_proof(
    const stdlib::Proof<Builder>& stdlib_proof_with_pi_flag, const std::vector<std::vector<FF>>& public_inputs)
{
    using Curve = typename Flavor::Curve;
    using PCS = typename Flavor::PCS;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using RelationParams = RelationParameters<typename Flavor::FF>;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using stdlib::bool_t;

    // TODO(#14234)[Unconditional PIs validation]: Remove the next 3 lines
    StdlibProof stdlib_proof = stdlib_proof_with_pi_flag;
    bool_t<Builder> pi_validation = !bool_t<Builder>(stdlib_proof.at(0));
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/16716) Origin Tag security mechanism is screaming
    // that there is a free witness affecting proof verificaton. Because it is and this bool allows completely disabling
    // public input logic. So this has to be removed in the future.
    pi_validation.unset_free_witness_tag();
    stdlib_proof.erase(stdlib_proof.begin());

    if (public_inputs.size() != AVM_NUM_PUBLIC_INPUT_COLUMNS) {
        throw_or_abort("AvmRecursiveVerifier::verify_proof: public inputs size mismatch");
    }
    for (const auto& public_input : public_inputs) {
        if (public_input.size() != AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH) {
            throw_or_abort("AvmRecursiveVerifier::verify_proof: public input size mismatch");
        }
    }

    transcript->load_proof(stdlib_proof);

    // TODO(#15892): Fiat-Shamir the vk hash by uncommenting the add_to_hash_buffer.
    // transcript->add_to_hash_buffer("avm_vk_hash", vk_hash);
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/16716) For now we are unsetting the free witness tags
    // to stop triggering the Origin Tag security mechanism, but the problem is that the VK is not hashed.
    for (auto& comm : key->get_all()) {
        comm.unset_free_witness_tag();
    }

    info("AVM vk hash in recursive verifier: ", vk_hash);

    RelationParams relation_parameters;
    VerifierCommitments commitments{ key };

    // TODO(https://github.com/AztecProtocol/aztec-packages/pull/17045): make the protocols secure at some point
    // // Add public inputs to transcript
    // for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
    //     for (size_t j = 0; j < public_inputs[i].size(); j++) {
    //         transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
    //                                        public_inputs[i][j]);
    //     }
    // }

    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        for (size_t j = 0; j < public_inputs[i].size(); j++) {
            // TODO(https://github.com/AztecProtocol/aztec-packages/pull/17045): make the protocols secure at some point
            // transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
            //                               public_inputs[i][j]);
            public_inputs[i][j].unset_free_witness_tag();
        }
    }
    // Get commitments to VM wires
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitments.get_wires_labels())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Get commitments to inverses
    for (auto [label, commitment] : zip_view(commitments.get_derived_labels(), commitments.get_derived())) {
        commitment = transcript->template receive_from_prover<Commitment>(label);
    }

    FF one{ 1 };
    one.convert_constant_to_fixed_witness(&builder);

    std::vector<FF> padding_indicator_array(key->log_fixed_circuit_size);
    std::ranges::fill(padding_indicator_array, one);

    // Multiply each linearly independent subrelation contribution by `alpha^i` for i = 0, ..., NUM_SUBRELATIONS - 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    SumcheckVerifier<Flavor> sumcheck(transcript, alpha, key->log_fixed_circuit_size);

    std::vector<FF> gate_challenges =
        transcript->template get_powers_of_challenge<FF>("Sumcheck:gate_challenge", key->log_fixed_circuit_size);

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

    // TODO(#14234)[Unconditional PIs validation]: Inside of loop, replace pi_validation.must_imply() by
    // public_input_evaluation.assert_equal(claimed_evaluations[i]
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        FF public_input_evaluation = evaluate_public_input_column(public_inputs[i], output.challenge);
        pi_validation.must_imply(public_input_evaluation == claimed_evaluations[i],
                                 format("public_input_evaluation failed at column ", i));
    }

    // Execute Shplemini rounds.
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ .commitments = RefVector<Commitment>::from_span(commitments.get_unshifted()),
                                 .evaluations = RefVector<FF>::from_span(output.claimed_evaluations.get_unshifted()) },
        .shifted = ClaimBatch{ .commitments = RefVector<Commitment>::from_span(commitments.get_to_be_shifted()),
                               .evaluations = RefVector<FF>::from_span(output.claimed_evaluations.get_shifted()) }
    };
    const BatchOpeningClaim<Curve> opening_claim = Shplemini::compute_batch_opening_claim(
        padding_indicator_array, claim_batcher, output.challenge, Commitment::one(&builder), transcript);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);

    if (builder.failed()) {
        info("AVM Recursive verifier builder failed with error: ", builder.err());
    }

    return pairing_points;
}

} // namespace bb::avm2
