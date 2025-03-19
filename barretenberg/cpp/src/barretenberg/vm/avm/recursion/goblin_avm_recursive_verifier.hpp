#pragma once

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
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

namespace bb {
class RecursiveAvm {
  public:
    static void test_recursive_avm(const HonkProof& proof, avm::AvmVerifier& verifier)
    {
        using AvmRecursiveFlavor = AvmRecursiveFlavor_<MegaCircuitBuilder>;

        using InnerFlavor = typename AvmRecursiveFlavor::NativeFlavor;
        using InnerFF = InnerFlavor::FF;
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
        using UltraRollupProver = UltraProver_<UltraRollupFlavor>;
        using UltraRollupVerifier = UltraVerifier_<UltraRollupFlavor>;

        // Pad all the public inputs with the right number of zeroes
        std::vector<FF> kernel_inputs(KERNEL_INPUTS_LENGTH);
        std::vector<FF> kernel_value_outputs(KERNEL_OUTPUTS_LENGTH);
        std::vector<FF> kernel_side_effect_outputs(KERNEL_OUTPUTS_LENGTH);
        std::vector<FF> kernel_metadata_outputs(KERNEL_OUTPUTS_LENGTH);
        std::vector<FF> calldata{ {} };
        std::vector<FF> returndata{ {} };
        std::vector<std::vector<InnerFF>> public_inputs{
            kernel_inputs, kernel_value_outputs, kernel_side_effect_outputs, kernel_metadata_outputs
        };
        std::vector<std::vector<InnerFF>> public_inputs_vec{
            kernel_inputs, kernel_value_outputs, kernel_side_effect_outputs, kernel_metadata_outputs, calldata,
            returndata
        };
        // ASSERT_TRUE(verifier.verify_proof(proof, public_inputs_vec)) << "native proof verification failed";

        const std::shared_ptr<InnerFlavor::VerificationKey> verification_key = verifier.key;

        GoblinProver goblin;
        MegaCircuitBuilder inner_builder(goblin.op_queue);
        RecursiveVerifier recursive_verifier{ &inner_builder, verification_key };
        auto agg_object =
            stdlib::recursion::init_default_aggregation_state<MegaCircuitBuilder, typename AvmRecursiveFlavor::Curve>(
                inner_builder);
        [[maybe_unused]] auto agg_output = recursive_verifier.verify_proof(proof, public_inputs_vec, agg_object);

        /*
        ASSERT_TRUE(
            verification_key->pcs_verification_key->pairing_check(agg_output.P0.get_value(),
        *agg_output.P1.get_value()))
            << "Pairing points (aggregation state) are not valid.";
        */

        goblin.merge(inner_builder);
        inner_builder.add_pairing_point_accumulator(
            stdlib::recursion::init_default_agg_obj_indices<MegaCircuitBuilder>(inner_builder));

        std::shared_ptr<MegaDeciderProvingKey> ultra_instance = std::make_shared<MegaDeciderProvingKey>(inner_builder);

        MegaProver ultra_prover(ultra_instance);
        auto recursion_proof = ultra_prover.construct_proof();

        GoblinProof g_proof = goblin.prove();

        auto eccvm_vkey = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
        auto translator_vkey = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());

        UltraCircuitBuilder outer_builder;
        GoblinVerifier::VerifierInput goblin_vinput{ std::make_shared<ECCVMVK>(goblin.get_eccvm_proving_key()),
                                                     std::make_shared<TranslatorVK>(
                                                         goblin.get_translator_proving_key()) };
        stdlib::recursion::honk::GoblinRecursiveVerifier gverifier{ &outer_builder, goblin_vinput };

        // next step fails likely because of a lack of a merge proof

        stdlib::recursion::honk::GoblinRecursiveVerifierOutput goblin_verifier_output = gverifier.verify(g_proof);

        // ASSERT(current_aggregation_object.size() && "Aggregation object should not be empty");
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1069): Add aggregation to goblin recursive
        // verifiers
        PairingPointAccumulatorIndices current_aggregation_object =
            stdlib::recursion::init_default_agg_obj_indices<UltraCircuitBuilder>(outer_builder);
        // This is currently just setting the aggregation object to the default one.
        outer_builder.add_pairing_point_accumulator(current_aggregation_object);

        // The tube only calls an IPA recursive verifier once, so we can just add this IPA claim and proof
        outer_builder.add_ipa_claim(goblin_verifier_output.opening_claim.get_witness_indices());
        outer_builder.ipa_proof = convert_stdlib_proof_to_native(goblin_verifier_output.ipa_transcript->proof_data);
        ASSERT(outer_builder.ipa_proof.size() && "IPA proof should not be empty");

        auto native_outer_vk = std::make_shared<MegaFlavor::VerificationKey>(ultra_instance->proving_key);
        auto outer_vk =
            std::make_shared<MegaRecursiveFlavorForUltraCircuit::VerificationKey>(&outer_builder, native_outer_vk);

        UltraRecursiveVerifier outer_verifier(&outer_builder, outer_vk);
        // Dummy aggregation object until we do proper aggregation
        stdlib::recursion::aggregation_state<typename MegaRecursiveFlavorForUltraCircuit::Curve> agg_obj =
            stdlib::recursion::init_default_aggregation_state<UltraCircuitBuilder,
                                                              typename MegaRecursiveFlavorForUltraCircuit::Curve>(
                outer_builder);

        // NOTE: this returns an output - should we do something with this? add
        outer_verifier.verify_proof(recursion_proof, agg_obj);
        outer_builder.add_pairing_point_accumulator(
            stdlib::recursion::init_default_agg_obj_indices<UltraCircuitBuilder>(outer_builder));

        auto outer_proving_key = std::make_shared<DeciderProvingKey_<UltraRollupFlavor>>(outer_builder);

        UltraRollupProver outer_prover(outer_proving_key);

        auto outer_proof = outer_prover.construct_proof();
        auto outer_verification_key =
            std::make_shared<typename UltraRollupFlavor::VerificationKey>(outer_proving_key->proving_key);
        auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
        UltraRollupVerifier final_verifier(outer_verification_key, ipa_verification_key);

        // WHAT WE NEED IS TO MODIFY THE AVM SO THAT:
        /*
            We have an avm_recursion_constraint that spits out this puppy:
        struct HonkRecursionConstraintOutput {
        PairingPointAccumulatorIndices agg_obj_indices;
        OpeningClaim<stdlib::grumpkin<Builder>> ipa_claim;
        StdlibProof<Builder> ipa_proof;
    };
        */
        ASSERT(final_verifier.verify_proof(outer_proof, outer_proving_key->proving_key.ipa_proof) &&
               "UltraRollupVerifier should accept");
    }
};
} // namespace bb