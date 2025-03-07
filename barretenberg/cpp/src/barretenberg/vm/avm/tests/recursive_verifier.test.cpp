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

void test_recursive_avm_gobble_gobble(const HonkProof& proof, bb::avm::AvmVerifier& verifier)
{
    using AvmRecursiveFlavor = AvmRecursiveFlavor_<MegaCircuitBuilder>;

    using InnerFlavor = typename AvmRecursiveFlavor::NativeFlavor;
    using InnerFF = InnerFlavor::FF;
    using RecursiveVerifier = bb::avm::AvmRecursiveVerifier_<AvmRecursiveFlavor>;
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using ECCVMVK = GoblinVerifier::ECCVMVerificationKey;
    using TranslatorVK = GoblinVerifier::TranslatorVerificationKey;
    using MegaProver = UltraProver_<MegaFlavor>;
    using MegaDeciderProvingKey = DeciderProvingKey_<MegaFlavor>;
    using MegaRecursiveFlavorForUltraCircuit = MegaRecursiveFlavor_<UltraCircuitBuilder>;
    using UltraRecursiveVerifier =
        bb::stdlib::recursion::honk::UltraRecursiveVerifier_<MegaRecursiveFlavorForUltraCircuit>;
    using UltraRollupProver = bb::UltraProver_<UltraRollupFlavor>;
    using UltraRollupVerifier = bb::UltraVerifier_<UltraRollupFlavor>;

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
        kernel_inputs, kernel_value_outputs, kernel_side_effect_outputs, kernel_metadata_outputs, calldata, returndata
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
        verification_key->pcs_verification_key->pairing_check(agg_output.P0.get_value(), *agg_output.P1.get_value()))
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
                                                 std::make_shared<TranslatorVK>(goblin.get_translator_proving_key()) };
    bb::stdlib::recursion::honk::GoblinRecursiveVerifier gverifier{ &outer_builder, goblin_vinput };

    // next step fails likely because of a lack of a merge proof

    bb::stdlib::recursion::honk::GoblinRecursiveVerifierOutput goblin_verifier_output = gverifier.verify(g_proof);

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
    bb::stdlib::recursion::aggregation_state<typename MegaRecursiveFlavorForUltraCircuit::Curve> agg_obj =
        bb::stdlib::recursion::init_default_aggregation_state<UltraCircuitBuilder,
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

TEST_F(AvmRecursiveTests, RecursionLatest)
{

    InnerBuilder circuit_builder = generate_avm_circuit();
    InnerComposer composer = InnerComposer();
    InnerProver prover = composer.create_prover(circuit_builder);
    InnerVerifier verifier = composer.create_verifier(circuit_builder);

    HonkProof proof = prover.construct_proof();

    test_recursive_avm_gobble_gobble(proof, verifier);
}
TEST_F(AvmRecursiveTests, recursion)
{
    // if (std::getenv("AVM_ENABLE_FULL_PROVING") == nullptr) {
    //     GTEST_SKIP();
    // }

    InnerBuilder circuit_builder = generate_avm_circuit();
    InnerComposer composer = InnerComposer();
    InnerProver prover = composer.create_prover(circuit_builder);
    InnerVerifier verifier = composer.create_verifier(circuit_builder);

    HonkProof proof = prover.construct_proof();

    // We just pad all the public inputs with the right number of zeroes
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
        kernel_inputs, kernel_value_outputs, kernel_side_effect_outputs, kernel_metadata_outputs, calldata, returndata
    };

    bool verified = verifier.verify_proof(proof, public_inputs_vec);
    ASSERT_TRUE(verified) << "native proof verification failed";

    // Create the outer verifier, to verify the proof
    const std::shared_ptr<InnerFlavor::VerificationKey> verification_key = verifier.key;

    // WTF is happening here?

    // 1. we make a goblin prover
    // 2. we construct the "outer" circuit as a MegaCircuit
    //    previously the outer circuit was bb::avm::AvmRecursiveVerifier_<RecursiveFlavor>::CircuitBuilder
    //    NOTE: why different?
    //    RecursiveFlavor = AvmRecursiveFlavor_<MegaCircuitBuilder> so...RecursiveFlavor::CircuitBuilder is Mega?
    // 3. We create a bb::avm::AvmRecursiveVerifier_<RecursiveFlavor> to verify the outer circuit
    // 4. `agg_output` is the result of `recurisve_verifier.verify_proof`
    // 5. We apply `goblin.merge` on the outer_circuit
    // 6. We generate a goblin proof of the merge circuit
    // 7. We construct a GoblinRecursiveVerifier out of an UltraCircuitBuilder and a GoblinVerifier::VerifierInput
    //    GoblinVerifier::VerifierInput is generated from the eccvm proving key and the translator proving key
    // OK so something weird going on is that when we recursively verify the goblin proof, we don't use the output?
    //  output needs to be spat up to next recursive layer (tube?)
    // 8. The UltraCircuitBuilder that we run the goblin verifier on...we generate a proving/verification key for it
    //    and generate + verify a proof. Note: this is a native verifier
    // 9. We create a MegaDeciderProvingKey out of the `outer_circuit` (the original circuit that verifies the AVM)
    // 10. We generate a proof of outer_circuit

    // OK What are we expecting out of this?

    // Tier 1: Original AVM proof
    // Tier 2: A Goblin-ified Mega circuit that verifies the AVM Proof - we get a proof of this (PI0)
    // Tier 3: An ECCVM + Translator proof of the transcript in PI0 (PI1, PI2)
    // Tier 4: An Ultra circuit that verifies PI0, PI1, PI2

    // What do we currently do?

    // `outer_circuit` runs folding verifier on AVM proof `recursive_verifier.verify_proof`
    // This spits out a transcript
    // We then call `goblin.merge` on `outer_circuit`. Can we do this? If merge is no longer represented as commitments
    // thne we can

    // OuterCircuit: [verifies AVM Pi0], [produces transcript via goblin.merge]
    // Builder verifies goblin plonk proofs generated from OuterCircuit
    // Builder needs to also verify OuterCircuit
    // `outer_circuit` runs
    GoblinProver goblin;
    MegaCircuitBuilder outer_circuit(goblin.op_queue);
    RecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };

    auto agg_object =
        stdlib::recursion::init_default_aggregation_state<MegaCircuitBuilder, typename RecursiveFlavor::Curve>(
            outer_circuit);

    auto agg_output = recursive_verifier.verify_proof(proof, public_inputs_vec, agg_object);

    bool agg_output_valid =
        verification_key->pcs_verification_key->pairing_check(agg_output.P0.get_value(), agg_output.P1.get_value());

    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    bool outer_circuit_checked = CircuitChecker::check(outer_circuit);
    ASSERT_TRUE(outer_circuit_checked) << "outer circuit check failed";

    std::cout << "A" << std::endl;
    auto manifest = verifier.transcript->get_manifest();
    auto recursive_manifest = recursive_verifier.transcript->get_manifest();
    std::cout << "B" << std::endl;

    EXPECT_EQ(manifest.size(), recursive_manifest.size());
    for (size_t i = 0; i < recursive_manifest.size(); ++i) {
        EXPECT_EQ(recursive_manifest[i], manifest[i]);
    }

    for (auto const [key_el, rec_key_el] : zip_view(verifier.key->get_all(), recursive_verifier.key->get_all())) {
        EXPECT_EQ(key_el, rec_key_el.get_value());
    }

    EXPECT_EQ(verifier.key->circuit_size, recursive_verifier.key->circuit_size);
    EXPECT_EQ(verifier.key->num_public_inputs, recursive_verifier.key->num_public_inputs);

    // in goblin test...
    // there are several mega circuits being generated
    // goblin proof is then constructed from the mega circuits

    // what is a goblin proof?
    // eccvm proof, translator proof and a "merge" proof
    // what is the merge proof?

    // `goblin.verify_merge` is called using a client builder input
    // input is a mega circuit
    // eww
    // The next step is...
    // An UltraBuilder is created
    // The UltraBuilder is used to create a circuit that verifies the goblin proof
    std::cout << "C" << std::endl;
    goblin.merge(outer_circuit);

    GoblinProof g_proof = goblin.prove();
    std::cout << "D" << std::endl;

    // Verify the goblin proof (eccvm, translator, merge); (Construct ECCVM/Translator verification keys from their
    // respective proving keys)
    auto eccvm_vkey = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
    auto translator_vkey = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());
    std::cout << "E" << std::endl;

    UltraCircuitBuilder builder;
    GoblinVerifier::VerifierInput goblin_vinput{ std::make_shared<ECCVMVK>(goblin.get_eccvm_proving_key()),
                                                 std::make_shared<TranslatorVK>(goblin.get_translator_proving_key()) };
    bb::stdlib::recursion::honk::GoblinRecursiveVerifier gverifier{ &builder, goblin_vinput };
    std::cout << "F" << std::endl;

    // next step fails likely because of a lack of a merge proof

    auto goblin_verifier_output = gverifier.verify(g_proof);

    // Validate natively that `goblin_verifier_output` produces valid IPA claim
    {
        auto crs_factory = std::make_shared<srs::factories::FileCrsFactory<curve::Grumpkin>>("../srs_db/grumpkin",
                                                                                             1 << CONST_ECCVM_LOG_N);
        auto grumpkin_verifier_commitment_key =
            std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N, crs_factory);
        OpeningClaim<curve::Grumpkin> native_claim = goblin_verifier_output.opening_claim.get_native_opening_claim();
        auto native_ipa_transcript = std::make_shared<NativeTranscript>(
            convert_stdlib_proof_to_native(goblin_verifier_output.ipa_transcript->proof_data));

        EXPECT_TRUE(
            IPA<curve::Grumpkin>::reduce_verify(grumpkin_verifier_commitment_key, native_claim, native_ipa_transcript));
    }
    std::cout << "G" << std::endl;

    EXPECT_EQ(builder.failed(), false) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
        std::cout << "H" << std::endl;
        OuterProver prover(proving_key);
        std::cout << "I" << std::endl;
        auto verification_key = std::make_shared<typename UltraFlavor::VerificationKey>(proving_key->proving_key);
        std::cout << "J" << std::endl;
        OuterVerifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);

        ASSERT(verified);
    }

    // const size_t srs_size = 1 << 23;
    auto ultra_instance = std::make_shared<MegaDeciderProvingKey>(outer_circuit);
    MegaProver ultra_prover(ultra_instance);
    auto ultra_verification_key = std::make_shared<MegaFlavor::VerificationKey>(ultra_instance->proving_key);
    MegaVerifier ultra_verifier(ultra_verification_key);

    vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    auto recursion_proof = ultra_prover.construct_proof();
    bool recursion_verified = ultra_verifier.verify_proof(recursion_proof);
    EXPECT_TRUE(recursion_verified) << "recursion proof verification failed";

    // Make a proof of the verification of an AVM proof
    // const size_t srs_size = 1 << 23;
    // auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(
    //     outer_circuit, TraceSettings{}, std::make_shared<bb::CommitmentKey<curve::BN254>>(srs_size));
    // auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(outer_circuit);

    // OuterProver ultra_prover(ultra_instance);
    // auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    // OuterVerifier ultra_verifier(ultra_verification_key);

    // // //  auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);

    // // OuterProver outer_prover(ultra_instance);

    // // goblin.merge(outer_circit);
    // // auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    // // GoblinVerifier ultra_verifier(ultra_verification_key);

    // vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    // auto recursion_proof = ultra_prover.construct_proof();
    // bool recursion_verified = ultra_verifier.verify_proof(recursion_proof);
    // EXPECT_TRUE(recursion_verified) << "recursion proof verification failed";

    // GoblinProof g_proof = goblin.prove();

    // // Verify the goblin proof (eccvm, translator, merge); (Construct ECCVM/Translator verification keys from their
    // // respective proving keys)
    // auto eccvm_vkey = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
    // auto translator_vkey = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());
    // GoblinVerifier goblin_verifier{ eccvm_vkey, translator_vkey };
    // bool g_verified = goblin_verifier.verify(g_proof);
    // EXPECT_TRUE(g_verified);
}

} // namespace tests_avm