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

    Builder* builder;
    std::shared_ptr<Transcript> transcript;

    // Note: instead of passing in a native verification key we pass in a vector of field elements whose type equals
    // Builder::FF
    // Reason is a bit of a workaround. In avm_recursion_constraint.cpp we construct an AVM verification key in the
    // current UltraRollupCircuit context.
    // However, the UltraRollupCircuit doesn't verify the AVM - it verifies a MegaCircuit that verifies the AVM.
    // We therefore need the vkey both present in the top-level UltraRollupCircuit *and* the downstream MegaCircuit.
    // Initial plan was to take a vkey in the UltraRollupCircuit context as an input, and then use `key.to_fields()` to
    // construct a MegaCircuit vkey context. However `to_fields` seems bugged when used in a recursive vkey setting.
    explicit AvmGoblinRecursiveVerifier(Builder* builder, const std::vector<UltraFF>& outer_key_fields)
        : outer_key_fields(outer_key_fields)
        , builder(builder)
    {}

    RecursiveAvmGoblinOutput verify_proof(const StdlibProof<Builder>& stdlib_proof,
                                          const std::vector<std::vector<UltraFF>>& public_inputs,
                                          AggregationObject input_agg_obj) const
    {

        using AvmRecursiveFlavor = AvmRecursiveFlavor_<MegaCircuitBuilder>;
        using FF = AvmRecursiveFlavor::FF;
        using UltraFF = UltraRollupRecursiveFlavor::FF;
        using RecursiveVerifier = avm::AvmRecursiveVerifier_<AvmRecursiveFlavor>;
        using ECCVMVerificationKey = ECCVMFlavor::VerificationKey;
        using TranslatorVerificationKey = TranslatorFlavor::VerificationKey;
        using ECCVMVK = GoblinVerifier::ECCVMVerificationKey;
        using TranslatorVK = GoblinVerifier::TranslatorVerificationKey;
        using MegaProver = UltraProver_<MegaFlavor>;
        using MegaDeciderProvingKey = DeciderProvingKey_<MegaFlavor>;
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

        // STEP 1:
        // Convert the stdlib Ultra proof, public inputs, and VK to stdlib Mega counterparts
        // (later on we must validate that the AVM proof fed into the MegaCircuit matches the one fed into the upstream
        // UltraCircuit)

        GoblinProver goblin;
        MegaCircuitBuilder inner_builder(goblin.op_queue);

        // Buffers to be hashed containing the elements of the Mega and Ultra proof, public inputs, and VK
        std::vector<FF> mega_hash_buffer;
        std::vector<UltraFF> ultra_hash_buffer;

        // lambda to convert from Ultra to Mega stdlib field buffer and add all elements to respective hash buffers
        auto convert_stdlib_ultra_to_stdlib_mega = [&](const std::vector<UltraFF>& ultra_object) {
            std::vector<FF> mega_object;
            for (const UltraFF& ultra_element : ultra_object) {
                FF mega_element = FF::from_witness(&inner_builder, ultra_element.get_value());
                mega_object.emplace_back(mega_element);
                mega_hash_buffer.emplace_back(mega_element);
                ultra_hash_buffer.emplace_back(ultra_element);
            }
            return mega_object;
        };

        // Convert the stdlib Ultra proof, public inputs, and VK to stdlib Mega counterparts
        StdlibProof<MegaCircuitBuilder> mega_stdlib_proof = convert_stdlib_ultra_to_stdlib_mega(stdlib_proof);
        std::vector<std::vector<FF>> mega_public_inputs;
        mega_public_inputs.reserve(public_inputs.size());
        for (const std::vector<UltraFF>& input_vec : public_inputs) {
            mega_public_inputs.emplace_back(convert_stdlib_ultra_to_stdlib_mega(input_vec));
        }
        std::vector<FF> key_fields = convert_stdlib_ultra_to_stdlib_mega(outer_key_fields);

        auto stdlib_key =
            std::make_shared<AvmRecursiveFlavor::VerificationKey>(inner_builder, std::span<FF>(key_fields));

        // we use the hash of the proof + public inputs to validate that we're correctly transferring data between the
        // Mega and Ultra circuits
        auto mega_input_hash = stdlib::poseidon2<MegaCircuitBuilder>::hash(inner_builder, mega_hash_buffer);
        // NOTE: there doesn't seem to be an easy way to know *which* public input index will map to mega_input_hash
        // which is troublesome
        mega_input_hash.set_public();

        // Step 2: Verify the AVM proof
        // NOTICE!!!! We don't currently propagate the aggregation object which we need to for this to be sound!
        RecursiveVerifier recursive_verifier{ &inner_builder, stdlib_key };
        auto default_agg_object =
            stdlib::recursion::init_default_aggregation_state<MegaCircuitBuilder, typename AvmRecursiveFlavor::Curve>(
                inner_builder);
        [[maybe_unused]] auto mega_agg_output =
            recursive_verifier.verify_proof(mega_stdlib_proof, mega_public_inputs, default_agg_object);

        // Step 3: run the goblin merge protocol
        // WORKTODO: this used to use goblin.merge() which I think added a merge rec verifier. Dont think this is needed
        // but need to take a look and confirm
        goblin.prove_merge(inner_builder);
        inner_builder.add_pairing_point_accumulator(
            stdlib::recursion::init_default_agg_obj_indices<MegaCircuitBuilder>(inner_builder));

        // Step 4: generate a proof of the above MegaCircuit
        std::shared_ptr<MegaDeciderProvingKey> ultra_instance = std::make_shared<MegaDeciderProvingKey>(inner_builder);
        MegaProver ultra_prover(ultra_instance);
        auto recursion_proof = ultra_prover.construct_proof();

        // Step 5: make a goblin proof and construct a GoblinRecursiveVerifier
        GoblinProof g_proof = goblin.prove();

        auto eccvm_vkey = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
        auto translator_vkey = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());
        GoblinVerifier::VerifierInput goblin_vinput{ std::make_shared<ECCVMVK>(goblin.get_eccvm_proving_key()),
                                                     std::make_shared<TranslatorVK>(
                                                         goblin.get_translator_proving_key()) };

        // Step 6: In our UltraCircuit, recursively verify the goblin proof
        stdlib::recursion::honk::GoblinRecursiveVerifier gverifier{ builder, goblin_vinput };
        stdlib::recursion::honk::GoblinRecursiveVerifierOutput goblin_verifier_output = gverifier.verify(g_proof);

        // // NOTE: I think this part is wrong. What do we initialize the builder's agg object to be?
        // PairingPointAccumulatorIndices current_aggregation_object =
        //     stdlib::recursion::init_default_agg_obj_indices<UltraCircuitBuilder>(*builder);
        // // This is currently just setting the aggregation object to the default one.
        // builder->add_pairing_point_accumulator(current_aggregation_object);

        // We only calls the IPA recursive verifier once, so we can just add this IPA claim and proof
        builder->add_ipa_claim(goblin_verifier_output.opening_claim.get_witness_indices());
        builder->ipa_proof = convert_stdlib_proof_to_native(goblin_verifier_output.ipa_transcript->proof_data);
        ASSERT(builder->ipa_proof.size() && "IPA proof should not be empty");

        // Step 7: Compute the verification key to recursively verify the MegaProof
        // NOTE: this part could be precomputed to save time
        auto native_outer_vk = std::make_shared<MegaFlavor::VerificationKey>(ultra_instance->proving_key);
        auto outer_vk = std::make_shared<MegaRecursiveFlavorForUltraCircuit::VerificationKey>(builder, native_outer_vk);

        // Step 8: In our UltraCirfcuit, recursively verify the mega proof
        UltraRecursiveVerifier outer_verifier(builder, outer_vk);
        StdlibProof<Builder> stdlib_recursion_proof = bb::convert_native_proof_to_stdlib(builder, recursion_proof);
        auto outer_verifier_output = outer_verifier.verify_proof(stdlib_recursion_proof, input_agg_obj);

        // Step 9: Validate that both `builder` and `inner_builder` use the same AVM proof data and AVM public inputs
        // Note: we don't seem to have a nice way of finding out where within a public input space a given value is that
        // we call `set_public` on. So we scan manually here to find the index :/
        size_t mega_input_hash_public_input_index = 0;
        for (const auto& proof_ele : stdlib_recursion_proof) {
            if (proof_ele.get_value() == mega_input_hash.get_value()) {
                break;
            }
            mega_input_hash_public_input_index += 1;
        }
        auto ultra_output_hash =
            stdlib::poseidon2<UltraRollupRecursiveFlavor::CircuitBuilder>::hash(*builder, ultra_hash_buffer);
        stdlib_recursion_proof[mega_input_hash_public_input_index].assert_equal(ultra_output_hash);

        // Step 10: gather up the ipa proof, ipa claim and output aggregation object produced from verifying the mega
        // proof + goblin proof, and return them
        auto ipa_proof_output = goblin_verifier_output.ipa_transcript->proof_data;
        auto ipa_claim_output = outer_verifier_output.ipa_opening_claim;
        auto pairing_accumulator_output = outer_verifier_output.agg_obj;

        RecursiveAvmGoblinOutput result{ .ipa_proof = ipa_proof_output,
                                         .ipa_claim = ipa_claim_output,
                                         .aggregation_object = pairing_accumulator_output };
        return result;
    }
};
} // namespace bb::avm
