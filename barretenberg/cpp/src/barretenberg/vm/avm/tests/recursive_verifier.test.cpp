#include "barretenberg/vm/avm/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.cpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/composer.hpp"
#include "barretenberg/vm/avm/recursion/goblin_avm_recursive_verifier.hpp"
#include "barretenberg/vm/avm/recursion/recursive_flavor.hpp"
#include "barretenberg/vm/avm/tests/helpers.test.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"

#include <gtest/gtest.h>

namespace bb::stdlib::recursion::honk {}

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;

class AvmRecursiveTests : public ::testing::Test {
  public:
    using RecursiveFlavor = AvmRecursiveFlavor_<MegaCircuitBuilder>;

    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = bb::avm::AvmCircuitBuilder;
    using InnerProver = bb::avm::AvmProver;
    using InnerVerifier = bb::avm::AvmVerifier;
    using InnerComposer = bb::avm::AvmComposer;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;

    using Transcript = InnerFlavor::Transcript;

    using RecursiveVerifier = bb::avm::AvmRecursiveVerifier_<RecursiveFlavor>;

    // In the goblin example, we have a GoblinProver object that takes in an inner circuit. we call `merge` method on
    // GoblinProver taking the inner circuit as argument. And then we make a goblin proof. The `merge` method invokes a
    // MergeRecursiveVerifier_ object and calls `verify_proof`

    // In the AVM context, that MergeRecursiveVerifier_ object needs to be an AvmRecursiveFlavor_ object
    // There are two ways we can do this.

    // First way is the template param the goblin prover to take in an inner recursive verifier type
    // 2nd way is add explicit new methods into goblin
    // fastest might be to get option 2 working and then refactor into option 1
    using OuterBuilder = UltraCircuitBuilder;
    using OuterProver = UltraProver;
    using OuterVerifier = UltraVerifier;
    using OuterDeciderProvingKey = DeciderProvingKey_<UltraFlavor>;

    using OuterRecursiveFlavor = MegaRecursiveFlavor_<UltraCircuitBuilder>;
    using OuterFF = OuterRecursiveFlavor::FF;
    using OuterRecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<OuterRecursiveFlavor>;

    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using ECCVMVK = GoblinVerifier::ECCVMVerificationKey;
    using TranslatorVK = GoblinVerifier::TranslatorVerificationKey;

    using MegaProver = UltraProver_<MegaFlavor>;
    using MegaVerifier = UltraVerifier_<MegaFlavor>;
    using MegaDeciderProvingKey = DeciderProvingKey_<MegaFlavor>;

    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    AvmPublicInputs public_inputs;

    // Generate an extremely simple avm trace
    InnerBuilder generate_avm_circuit()
    {
        public_inputs = generate_base_public_inputs();
        AvmTraceBuilder trace_builder(public_inputs);
        InnerBuilder builder;

        trace_builder.op_set(0, 1, 1, AvmMemoryTag::U8);
        trace_builder.op_set(0, 1, 2, AvmMemoryTag::U8);
        trace_builder.op_add(0, 1, 2, 3);
        trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
        trace_builder.op_return(0, 0, 100);
        auto trace = trace_builder.finalize(); // Passing true enables a longer trace with lookups

        inject_end_gas_values(public_inputs, trace);

        builder.set_trace(std::move(trace));
        builder.check_circuit();
        vinfo("inner builder - num gates: ", builder.get_estimated_num_finalized_gates());

        return builder;
    }
};

TEST_F(AvmRecursiveTests, GoblinRecursion)
{

    InnerBuilder circuit_builder = generate_avm_circuit();
    InnerComposer composer = InnerComposer();
    InnerProver prover = composer.create_prover(circuit_builder);
    InnerVerifier inner_verifier = composer.create_verifier(circuit_builder);

    HonkProof proof = prover.construct_proof();

    UltraCircuitBuilder outer_builder;
    using UltraRollupRecursiveFlavor = UltraRollupRecursiveFlavor_<UltraRollupFlavor::CircuitBuilder>;
    using UltraFF = UltraRollupRecursiveFlavor::FF;

    std::shared_ptr<AvmRecursiveFlavor_<UltraRollupRecursiveFlavor::CircuitBuilder>::VerificationKey> avm_key =
        std::make_shared<AvmRecursiveFlavor_<UltraRollupRecursiveFlavor::CircuitBuilder>::VerificationKey>(
            &outer_builder, inner_verifier.key);

    auto key_fields_native = inner_verifier.key->to_field_elements();
    std::vector<UltraFF> outer_key_fields;
    for (const auto& f : key_fields_native) {
        UltraFF val = UltraFF::from_witness(&outer_builder, f);
        outer_key_fields.push_back(val);
    }
    avm::AvmGoblinRecursiveVerifier verifier(&outer_builder, outer_key_fields);
    using MegaRecursiveFlavorForUltraCircuit = MegaRecursiveFlavor_<UltraCircuitBuilder>;

    stdlib::recursion::aggregation_state<typename MegaRecursiveFlavorForUltraCircuit::Curve> agg_obj =
        stdlib::recursion::init_default_aggregation_state<UltraCircuitBuilder,
                                                          typename MegaRecursiveFlavorForUltraCircuit::Curve>(
            outer_builder);

    std::vector<FF> kernel_inputs(KERNEL_INPUTS_LENGTH);
    std::vector<FF> kernel_value_outputs(KERNEL_OUTPUTS_LENGTH);
    std::vector<FF> kernel_side_effect_outputs(KERNEL_OUTPUTS_LENGTH);
    std::vector<FF> kernel_metadata_outputs(KERNEL_OUTPUTS_LENGTH);
    std::vector<FF> calldata{ {} };
    std::vector<FF> returndata{ {} };

    std::vector<std::vector<InnerFF>> public_inputs_vec{
        kernel_inputs, kernel_value_outputs, kernel_side_effect_outputs, kernel_metadata_outputs, calldata, returndata
    };

    StdlibProof<UltraCircuitBuilder> stdlib_proof = bb::convert_native_proof_to_stdlib(&outer_builder, proof);

    std::vector<std::vector<UltraFF>> public_inputs_ct;
    public_inputs_ct.reserve(public_inputs_vec.size());

    for (const auto& vec : public_inputs_vec) {
        std::vector<UltraFF> vec_ct;
        vec_ct.reserve(vec.size());
        for (const auto& el : vec) {
            vec_ct.push_back(bb::stdlib::witness_t<UltraCircuitBuilder>(&outer_builder, el));
        }
        public_inputs_ct.push_back(vec_ct);
    }

    auto proof_outputs = verifier.verify_proof(stdlib_proof, public_inputs_ct, agg_obj);

    auto outer_proving_key = std::make_shared<DeciderProvingKey_<UltraRollupFlavor>>(outer_builder);
    using UltraRollupProver = UltraProver_<UltraRollupFlavor>;

    UltraRollupProver outer_prover(outer_proving_key);

    auto outer_proof = outer_prover.construct_proof();
    auto outer_verification_key =
        std::make_shared<typename UltraRollupFlavor::VerificationKey>(outer_proving_key->proving_key);
    auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    UltraRollupVerifier final_verifier(outer_verification_key, ipa_verification_key);

    EXPECT_TRUE(final_verifier.verify_proof(outer_proof, outer_proving_key->proving_key.ipa_proof));

    //  AvmGoblinRecursiveVerifier::test_recursive_avm(proof, verifier);
}

} // namespace tests_avm