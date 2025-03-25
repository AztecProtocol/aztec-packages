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

class AvmGoblinRecursiveVerifier {
  public:
    using UltraRollupRecursiveFlavor = UltraRollupRecursiveFlavor_<UltraRollupFlavor::CircuitBuilder>;
    struct RecursiveAvmGoblinOutput {
        using UltraBuilder = UltraRollupRecursiveFlavor::CircuitBuilder;
        using UltraFF = UltraRollupRecursiveFlavor::Curve::ScalarField;
        std::vector<UltraFF> ipa_proof;
        OpeningClaim<stdlib::grumpkin<UltraBuilder>> ipa_claim;
        stdlib::recursion::aggregation_state<stdlib::bn254<UltraBuilder>> aggregation_object;
    };
    using Builder = typename UltraRollupRecursiveFlavor::CircuitBuilder;
    using AggregationObject = bb::stdlib::recursion::aggregation_state<stdlib::bn254<Builder>>;

    using RecursiveFlavor = AvmRecursiveFlavor_<MegaCircuitBuilder>;

    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using UltraFF = UltraRollupRecursiveFlavor::Curve::ScalarField;

    using OuterAvmKey = AvmRecursiveFlavor_<UltraRollupRecursiveFlavor::CircuitBuilder>::VerificationKey;
    std::vector<UltraFF> outer_key_fields;

    Builder* ultra_builder;
    std::shared_ptr<Transcript> transcript;

    // WORKTODO: Its a bit arbitrary which representation the inputs (proof, pub, VK) should be received in. We need
    // both for the hash buffers but only mega for actual verification. Is there a clean choice here?
    explicit AvmGoblinRecursiveVerifier(Builder* builder, const std::vector<UltraFF>& outer_key_fields)
        : outer_key_fields(outer_key_fields)
        , ultra_builder(builder)
    {}

    RecursiveAvmGoblinOutput verify_proof(const StdlibProof<Builder>& stdlib_proof,
                                          const std::vector<std::vector<UltraFF>>& public_inputs,
                                          AggregationObject input_agg_obj) const
    {

        using AvmRecursiveFlavor = AvmRecursiveFlavor_<MegaCircuitBuilder>;
        using FF = AvmRecursiveFlavor::FF;
        using UltraFF = UltraRollupRecursiveFlavor::FF;
        using RecursiveVerifier = avm::AvmRecursiveVerifier_<AvmRecursiveFlavor>;
        using ECCVMVK = GoblinVerifier::ECCVMVerificationKey;
        using TranslatorVK = GoblinVerifier::TranslatorVerificationKey;
        using MegaProver = UltraProver_<MegaFlavor>;
        using MegaRecursiveFlavorForUltraCircuit = MegaRecursiveFlavor_<UltraCircuitBuilder>;
        using UltraRecursiveVerifier =
            stdlib::recursion::honk::UltraRecursiveVerifier_<MegaRecursiveFlavorForUltraCircuit>;

        /*
        Here's an attempt at a flow chat that describes what this function is doing.
        We start with an AVMProof and end up with an UltraProof and an IPA proof.
        The goal is to verify the AVMProof using a goblin-enhanced MegaCircuit,
        and then "blackbox" the goblin plonk component by recursively verifying both
        the MegaCircuit proof AND the goblin plonk proofs
        in an UltraRecursiveRollupCircuit

                            AVMProof (this is `stdlib_proof`)
                                |
                                |
                                v
                            MegaCircuit (verifies AVMProof)
                                |
                                |
                                v
                     MergeProof + MegaProof
                          |         |
                          |         -----------------
                          v                         |
             ECCVMCircuit + TranslatorCircuit       |
                   |              |                 |
                   |              |                 |
                   v              v                 |
              ECCVMProof    TranslatorProof         |
                   |              |                 |
                   |              |                 |
                   v              v                 v
                  ####UltraRecursiveRollupCircuit##### (this is `builder`)
                                  |
                                  |
                                  v
                       UltraProof + IPA Proof
        */

        // STEP 1: To establish consistency of the the proof and public inputs between the inner (Mega) circuit and the
        // outer (Ultra) circuit, each circuit computes a hash of these components and consistency is checked on the
        // result.
        // WORKTODO: think through whether this mechanism is needed/makes sense. We dont do anything with these
        // components in the ultra circuit aside from hashing them so what exactly is the hash check buying us?

        // Instantiate Mega builder for the inner circuit (AVM proof recursive verifier)
        GoblinProver goblin;
        MegaCircuitBuilder mega_builder(goblin.op_queue);

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

        // Convert the stdlib Ultra proof, public inputs, and VK to stdlib Mega counterparts
        std::vector<FF> mega_stdlib_proof = convert_stdlib_ultra_to_stdlib_mega(stdlib_proof);
        std::vector<std::vector<FF>> mega_public_inputs;
        mega_public_inputs.reserve(public_inputs.size());
        for (const std::vector<UltraFF>& input_vec : public_inputs) {
            mega_public_inputs.emplace_back(convert_stdlib_ultra_to_stdlib_mega(input_vec));
        }
        std::vector<FF> key_fields = convert_stdlib_ultra_to_stdlib_mega(outer_key_fields);

        // Compute the hash of the buffer in the Mega circuit
        auto mega_input_hash = stdlib::poseidon2<MegaCircuitBuilder>::hash(mega_builder, mega_hash_buffer);
        // WORKTODO: address this or make an issue: NOTE: there doesn't seem to be an easy way to know *which* public
        // input index will map to mega_input_hash which is troublesome
        mega_input_hash.set_public(); // Add the hash result to the public inputs to propagate it to the outer circuit

        // Step 2: Construct a Mega-arithmetized AVM recursive verifier circuit
        auto stdlib_key =
            std::make_shared<AvmRecursiveFlavor::VerificationKey>(mega_builder, std::span<FF>(key_fields));
        RecursiveVerifier recursive_verifier{ &mega_builder, stdlib_key };
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1304): Do proper pairing point aggregation.
        auto default_agg_object =
            stdlib::recursion::init_default_aggregation_state<MegaCircuitBuilder, typename AvmRecursiveFlavor::Curve>(
                mega_builder);
        [[maybe_unused]] auto mega_agg_output =
            recursive_verifier.verify_proof(mega_stdlib_proof, mega_public_inputs, default_agg_object);
        mega_builder.add_pairing_point_accumulator(
            stdlib::recursion::init_default_agg_obj_indices<MegaCircuitBuilder>(mega_builder));

        // Step 3: Generate a Mega proof of the AVM recursive verifier circuit
        MegaProver mega_prover(mega_builder);
        HonkProof mega_proof = mega_prover.construct_proof();

        // Step 4: Construct a corresponding Goblin proof (includes Merge, ECCVM, and Translator proofs)
        goblin.prove_merge(mega_builder);
        GoblinProof goblin_proof = goblin.prove();

        // Step 5: Recursively verify the Mega proof in the outer (Ultra) circuit
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1305): Mega + Goblin VKs must be circuit constants.
        auto native_outer_vk = std::make_shared<MegaFlavor::VerificationKey>(mega_prover.proving_key->proving_key);
        auto outer_vk =
            std::make_shared<MegaRecursiveFlavorForUltraCircuit::VerificationKey>(ultra_builder, native_outer_vk);
        UltraRecursiveVerifier outer_verifier(ultra_builder, outer_vk);
        StdlibProof<Builder> ultra_proof = bb::convert_native_proof_to_stdlib(ultra_builder, mega_proof);
        auto outer_verifier_output = outer_verifier.verify_proof(ultra_proof, input_agg_obj);

        // Step 6: Recursively verify the goblin proof in the Ultra circuit
        GoblinVerifier::VerifierInput goblin_vinput{ std::make_shared<ECCVMVK>(goblin.get_eccvm_proving_key()),
                                                     std::make_shared<TranslatorVK>(
                                                         goblin.get_translator_proving_key()) };
        stdlib::recursion::honk::GoblinRecursiveVerifier gverifier{ ultra_builder, goblin_vinput };
        stdlib::recursion::honk::GoblinRecursiveVerifierOutput goblin_verifier_output = gverifier.verify(goblin_proof);

        // We only call the IPA recursive verifier once, so we can just add this IPA claim and proof
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1306): Determine the right location/entity to
        // handle this IPA data propagation.
        ultra_builder->add_ipa_claim(goblin_verifier_output.opening_claim.get_witness_indices());
        ultra_builder->ipa_proof = convert_stdlib_proof_to_native(goblin_verifier_output.ipa_transcript->proof_data);
        ASSERT(ultra_builder->ipa_proof.size() && "IPA proof should not be empty");

        // Step 9: Validate that both `builder` and `inner_builder` use the same AVM proof data and AVM public inputs
        // Note: we don't seem to have a nice way of finding out where within a public input space a given value is that
        // we call `set_public` on. So we scan manually here to find the index :/
        size_t mega_input_hash_public_input_index = 0;
        for (const auto& proof_ele : ultra_proof) {
            if (proof_ele.get_value() == mega_input_hash.get_value()) {
                break;
            }
            mega_input_hash_public_input_index += 1;
        }
        auto ultra_output_hash =
            stdlib::poseidon2<UltraRollupRecursiveFlavor::CircuitBuilder>::hash(*ultra_builder, ultra_hash_buffer);
        ultra_proof[mega_input_hash_public_input_index].assert_equal(ultra_output_hash);

        // Step 10: gather up the ipa proof, ipa claim and output aggregation object produced from verifying the mega
        // proof + goblin proof, and return them
        RecursiveAvmGoblinOutput result{ .ipa_proof = goblin_verifier_output.ipa_transcript->proof_data,
                                         .ipa_claim = goblin_verifier_output.opening_claim,
                                         .aggregation_object = outer_verifier_output.agg_obj };
        return result;
    }
};
} // namespace bb::avm
