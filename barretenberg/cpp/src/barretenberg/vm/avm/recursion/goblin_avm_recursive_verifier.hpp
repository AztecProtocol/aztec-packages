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

    RecursiveAvmGoblinOutput verify_proof(
        const StdlibProof<Builder>& stdlib_proof,
        const std::vector<std::vector<typename UltraRollupRecursiveFlavor::FF>>& public_inputs,
        AggregationObject agg_obj) const
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
        // Take the UltraBuilder proof inputs and convert into MegaBuilder proof inputs
        // (later on we must validate that the AVM proof fed into the MegaCircuit matches the one fed into the upstream
        // UltraCircuit)
        StdlibProof<MegaCircuitBuilder> mega_stdlib_proof;
        std::vector<std::vector<typename AvmRecursiveFlavor::FF>> mega_public_inputs;
        GoblinProver goblin;
        MegaCircuitBuilder inner_builder(goblin.op_queue);

        std::vector<FF> input_hash;
        std::vector<UltraFF> upstream_hash;
        for (auto& element : stdlib_proof) {
            FF val = FF::from_witness(&inner_builder, element.get_value());
            mega_stdlib_proof.emplace_back(val);
            input_hash.emplace_back(val);
            upstream_hash.emplace_back(element);
        }
        for (auto& input_vec : public_inputs) {
            std::vector<FF> inner_vec;
            for (auto& input : input_vec) {
                FF val = FF::from_witness(&inner_builder, input.get_value());
                inner_vec.emplace_back(val);
                input_hash.emplace_back(val);
                upstream_hash.emplace_back(input);
            }
            mega_public_inputs.emplace_back(inner_vec);
        }

        // Step 1.5 Convert the UltraRollupCircuit representation of the AVM verification key into a MegaCircuit
        // representation
        std::vector<FF> key_fields;
        for (const auto& f : outer_key_fields) {
            FF val = FF::from_witness(&inner_builder, f.get_value());
            key_fields.emplace_back(val);
            input_hash.emplace_back(val);
            upstream_hash.emplace_back(f);
        }
        auto stdlib_key = std::make_shared<AvmRecursiveFlavor_<MegaCircuitBuilder>::VerificationKey>(
            inner_builder, std::span<FF>(key_fields));

        // we use the hash of the proof + public inputs to validate that we're correctly transferring data between the
        // Mega and Ultra circuits
        auto mega_input_hash = stdlib::poseidon2<MegaCircuitBuilder>::hash(inner_builder, input_hash);
        // NOTE: there doesn't seem to be an easy way to know *which* public input index will map to mega_input_hash
        // which is troublesome
        mega_input_hash.set_public();

        // Step 2: Verify the AVM proof
        // NOTICE!!!! We don't currently propagate the aggregation object which we need to for this to be sound!
        RecursiveVerifier recursive_verifier{ &inner_builder, stdlib_key };
        auto mega_agg_object =
            stdlib::recursion::init_default_aggregation_state<MegaCircuitBuilder, typename AvmRecursiveFlavor::Curve>(
                inner_builder);
        [[maybe_unused]] auto agg_output =
            recursive_verifier.verify_proof(mega_stdlib_proof, mega_public_inputs, mega_agg_object);

        // Step 3: run the goblin merge protocol
        goblin.merge(inner_builder);
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

        // NOTE: I think this part is wrong. What do we initialize the builder's agg object to be?
        PairingPointAccumulatorIndices current_aggregation_object =
            stdlib::recursion::init_default_agg_obj_indices<UltraCircuitBuilder>(*builder);
        // This is currently just setting the aggregation object to the default one.
        builder->add_pairing_point_accumulator(current_aggregation_object);

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
        auto outer_verifier_output = outer_verifier.verify_proof(stdlib_recursion_proof, agg_obj);

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
            stdlib::poseidon2<UltraRollupRecursiveFlavor::CircuitBuilder>::hash(*builder, upstream_hash);
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