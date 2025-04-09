#pragma once

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/composer.hpp"
#include "barretenberg/vm/avm/recursion/recursive_flavor.hpp"
#include "barretenberg/vm/avm/recursion/recursive_verifier.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"
namespace bb::avm {

/**
 * @brief Recursive verifier of AVM proofs that utilizes the Goblin mechanism for efficient EC operations.
 * @details Recursive verification for AVM proofs proceeds in two phases: (1) recursive verification of the AVM proof in
 * a Mega-arithmetized circuit C_M, and (2) recursive verification of the proof of C_M in an Ultra-arithmetized circuit
 * C_U. This results in a protocol that overall is more efficient than direct recursive verification of the AVM proof in
 * an Ultra circuit.
 *
 * The proof of the Mega-arithmetized AVM recursive verifier circuit C_M is of the form {\pi_M, \pi_G}, where \pi_M is a
 * MegaHonk proof and \pi_G is a Goblin proof consisting of an ECCVM proof, a Translator proof, and a Merge proof. \pi_M
 * establishes proper verification of the AVM proof up to the deferred EC operations, whose correctness is in turn
 * established by \pi_G. Note: the ECCCVM proof (part of \pi_G) contains an IPA proof. Recursive verification of this
 * component will stop short of full verification, resulting in an IPA claim that must be accumulated with other such
 * claims before final verification later on (e.g. at the root). This is analogous to the aggregation of pairing point
 * inputs for proving systems that use KZG, such as Ultra/MegaHonk.
 *
 * The Ultra-arithmetized circuit C_U is responsible for recursive verification of {\pi_M, \pi_G}, i.e. it contains both
 * a Mega and a Goblin recursive verifier. The output of this recursive verification is a pairing check accumulator and
 * an IPA claim accumulator. To ensure proper transfer of the AVM verifier inputs {\pi, pub_inputs, VK}_{AVM} between
 * the Mega and Ultra circuits, we utilize a hash consistency check. The representation of these inputs in C_M is hashed
 * and the result h_M is propagated via the public inputs (i.e. it will be contained in \pi_M.pub_inputs). Then, C_U
 * computes the hash h_U of its own representation of the same data and performs the check h_U = \pi_M.pub_inputs.h_M.
 *
 * @note The Mega circuit must be constrained to be a genuine AVM verifier circuit. This is done by fixing the VK(s)
 * corresponding to proofs {\pi_M, \pi_G} to be circuit constants in C_U.
 *
 */
class AvmGoblinRecursiveVerifier {
  public:
    using UltraBuilder = UltraCircuitBuilder;
    using MegaBuilder = MegaCircuitBuilder;
    using UltraRollupRecursiveFlavor = UltraRollupRecursiveFlavor_<UltraBuilder>;

    using AggregationObject = bb::stdlib::recursion::aggregation_state<UltraBuilder>;

    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<UltraBuilder>>;
    using UltraFF = UltraRollupRecursiveFlavor::Curve::ScalarField;

    using AvmRecursiveFlavor = AvmRecursiveFlavor_<MegaBuilder>;
    using AvmRecursiveVerificationKey = AvmRecursiveFlavor::VerificationKey;

    // The structure of the final output of the goblinized AVM recursive verifier. The IPA data comes from recursive
    // verification of the ECCVM proof as part of Goblin recursive verification.
    struct RecursiveAvmGoblinOutput {
        std::vector<UltraFF> ipa_proof;
        OpeningClaim<stdlib::grumpkin<UltraBuilder>> ipa_claim;
        stdlib::recursion::aggregation_state<UltraBuilder> aggregation_object;
    };

    std::vector<UltraFF> outer_key_fields;

    UltraBuilder* ultra_builder;
    std::shared_ptr<Transcript> transcript;

    explicit AvmGoblinRecursiveVerifier(UltraBuilder* builder, const std::vector<UltraFF>& outer_key_fields)
        : outer_key_fields(outer_key_fields)
        , ultra_builder(builder)
    {}

    RecursiveAvmGoblinOutput verify_proof(const StdlibProof<UltraBuilder>& stdlib_proof,
                                          const std::vector<std::vector<UltraFF>>& public_inputs,
                                          AggregationObject input_agg_obj) const
    {

        using FF = AvmRecursiveFlavor::FF;
        using AvmRecursiveVerifier = avm::AvmRecursiveVerifier_<AvmRecursiveFlavor>;
        using ECCVMVK = Goblin::ECCVMVerificationKey;
        using TranslatorVK = Goblin::TranslatorVerificationKey;
        using MegaProver = UltraProver_<MegaFlavor>;
        using MegaRecursiveFlavorForUltraCircuit = MegaRecursiveFlavor_<UltraCircuitBuilder>;
        using MegaVerificationKey = MegaFlavor::VerificationKey;
        using MegaRecursiveVerificationKey = MegaRecursiveFlavorForUltraCircuit::VerificationKey;
        using MegaAggregationObject = stdlib::recursion::aggregation_state<MegaBuilder>;
        // A MegaHonk recursive verifier arithmetized with Ultra
        using MegaRecursiveVerifier =
            stdlib::recursion::honk::UltraRecursiveVerifier_<MegaRecursiveFlavorForUltraCircuit>;
        using GoblinRecursiveVerifier = stdlib::recursion::honk::GoblinRecursiveVerifier;
        using GoblinRecursiveVerifierOutput = stdlib::recursion::honk::GoblinRecursiveVerifierOutput;

        // STEP 1: To establish consistency of the proof, public inputs and VK for the AVM between the inner (Mega)
        // circuit and the outer (Ultra) circuit, each circuit computes a hash of these components and consistency is
        // checked on the result. The corresponding hash buffers are constructed here.

        // Instantiate Mega builder for the inner circuit (AVM proof recursive verifier)
        Goblin goblin;
        MegaBuilder mega_builder(goblin.op_queue);

        // Buffers to be hashed containing the elements of the Mega and Ultra proof, public inputs, and VK
        std::vector<FF> mega_hash_buffer;
        std::vector<UltraFF> ultra_hash_buffer;

        // lambda to convert from Ultra to Mega stdlib field buffer and add all elements to respective hash buffers
        auto convert_stdlib_ultra_to_stdlib_mega = [&](const std::vector<UltraFF>& ultra_object) {
            std::vector<FF> mega_object;
            for (const UltraFF& ultra_element : ultra_object) {
                FF mega_element = FF::from_witness(&mega_builder, ultra_element.get_value());
                mega_object.emplace_back(mega_element);
                mega_hash_buffer.emplace_back(mega_element);
                ultra_hash_buffer.emplace_back(ultra_element);
            }
            return mega_object;
        };

        // Convert the stdlib Ultra proof, public inputs, and VK to stdlib Mega counterparts and add them to the
        // respective hash buffers.
        std::vector<FF> mega_stdlib_proof = convert_stdlib_ultra_to_stdlib_mega(stdlib_proof);
        std::vector<std::vector<FF>> mega_public_inputs;
        mega_public_inputs.reserve(public_inputs.size());
        for (const std::vector<UltraFF>& input_vec : public_inputs) {
            mega_public_inputs.emplace_back(convert_stdlib_ultra_to_stdlib_mega(input_vec));
        }
        std::vector<FF> key_fields = convert_stdlib_ultra_to_stdlib_mega(outer_key_fields);

        // Compute the hash of the buffer in the Mega circuit and save its index within the public inputs
        auto mega_input_hash = stdlib::poseidon2<MegaBuilder>::hash(mega_builder, mega_hash_buffer);
        const size_t mega_hash_public_input_index = mega_builder.public_inputs.size();
        mega_input_hash.set_public(); // Add the hash result to the public inputs to propagate it to the outer circuit

        // STEP 2: Construct a Mega-arithmetized AVM recursive verifier circuit

        auto stdlib_key = std::make_shared<AvmRecursiveVerificationKey>(mega_builder, std::span<FF>(key_fields));
        AvmRecursiveVerifier recursive_verifier{ &mega_builder, stdlib_key };
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1304): Do proper pairing point aggregation.
        auto default_agg_object = MegaAggregationObject::construct_default(mega_builder);
        [[maybe_unused]] auto mega_agg_output =
            recursive_verifier.verify_proof(mega_stdlib_proof, mega_public_inputs, default_agg_object);
        MegaAggregationObject::add_default_pairing_points_to_public_inputs(mega_builder);

        // STEP 3: Generate a Mega and Goblin proof {\pi_M, \pi_G} of the AVM recursive verifier circuit

        // Construct Mega proof
        MegaProver mega_prover(mega_builder);
        HonkProof mega_proof = mega_prover.construct_proof();

        // Construct corresponding Goblin proof (includes Merge, ECCVM, and Translator proofs)
        goblin.prove_merge(mega_builder);
        GoblinProof goblin_proof = goblin.prove();

        // STEP 4: Recursively verify the Mega and Goblin proofs {\pi_M, \pi_G} in the outer (Ultra) circuit

        // Recursively verify the Mega proof in the Ultra circuit
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1305): Mega + Goblin VKs must be circuit constants.
        auto native_outer_vk = std::make_shared<MegaVerificationKey>(mega_prover.proving_key->proving_key);
        auto outer_vk = std::make_shared<MegaRecursiveVerificationKey>(ultra_builder, native_outer_vk);
        MegaRecursiveVerifier outer_verifier(ultra_builder, outer_vk);
        StdlibProof<UltraBuilder> ultra_proof = bb::convert_native_proof_to_stdlib(ultra_builder, mega_proof);
        auto outer_verifier_output = outer_verifier.verify_proof(ultra_proof, input_agg_obj);

        // Recursively verify the goblin proof in the Ultra circuit
        Goblin::VerificationKey goblin_vinput{ std::make_shared<ECCVMVK>(), std::make_shared<TranslatorVK>() };
        GoblinRecursiveVerifier gverifier{ ultra_builder, goblin_vinput };
        GoblinRecursiveVerifierOutput goblin_verifier_output = gverifier.verify(goblin_proof);

        // Propagate the IPA claim via the public inputs of the outer circuit
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1306): Determine the right location/entity to
        // handle this IPA data propagation.
        ultra_builder->add_ipa_claim(goblin_verifier_output.opening_claim.get_witness_indices());
        ultra_builder->ipa_proof = convert_stdlib_proof_to_native(goblin_verifier_output.ipa_transcript->proof_data);
        ASSERT(ultra_builder->ipa_proof.size() && "IPA proof should not be empty");

        // STEP 5: Validate the consistency of the AVM verifier inputs {\pi, pub_inputs, VK}_{AVM} between the inner
        // (Mega) circuit and the outer (Ultra) by asserting equality on the hash of this data computed independently by
        // each circuit.

        auto ultra_hash = stdlib::poseidon2<UltraBuilder>::hash(*ultra_builder, ultra_hash_buffer);
        ultra_proof[mega_hash_public_input_index].assert_equal(ultra_hash);

        // Return ipa proof, ipa claim and output aggregation object produced from verifying the Mega + Goblin proofs
        RecursiveAvmGoblinOutput result{ .ipa_proof = goblin_verifier_output.ipa_transcript->proof_data,
                                         .ipa_claim = goblin_verifier_output.opening_claim,
                                         .aggregation_object = outer_verifier_output.agg_obj };
        return result;
    }
};
} // namespace bb::avm
