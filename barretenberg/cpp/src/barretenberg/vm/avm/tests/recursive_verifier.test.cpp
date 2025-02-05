#include "barretenberg/vm/avm/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
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

namespace bb::stdlib::recursion::honk {

class AVMGoblin {

  public:
    using Builder = UltraCircuitBuilder;
    using MergeVerifier = goblin::MergeRecursiveVerifier_<Builder>;

    using TranslatorFlavor = TranslatorRecursiveFlavor_<Builder>;
    using TranslatorVerifier = TranslatorRecursiveVerifier_<TranslatorFlavor>;
    using TranslationEvaluations = TranslatorVerifier::TranslationEvaluations;
    using TranslatorBF = TranslatorFlavor::BF;
    using VerifierInput = GoblinVerifier::VerifierInput;

    using ECCVMFlavor = ECCVMRecursiveFlavor_<Builder>;
    using ECCVMVerifier = ECCVMRecursiveVerifier_<ECCVMFlavor>;
    using OpQueue = bb::ECCOpQueue;
    using ECCVMBuilder = bb::ECCVMCircuitBuilder;
    using ECCVMNativeFlavor = bb::ECCVMFlavor;
    using ECCVMProvingKey = ECCVMNativeFlavor::ProvingKey;
    using NativeTranscript = NativeTranscript;
    using TranslatorBuilder = bb::TranslatorCircuitBuilder;

    //  Builder* builder;

    GoblinProof proof;

    ECCVMProof eccvm_proof;
    HonkProof translator_proof;
    ECCVMProver::TranslationEvaluations translation_evaluations;
    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();
    std::unique_ptr<ECCVMProver> eccvm_prover;
    std::shared_ptr<ECCVMProvingKey> eccvm_key;
    std::unique_ptr<TranslatorProver> translator_prover;
    std::shared_ptr<CommitmentKey<curve::BN254>> commitment_key;

    AVMGoblin(const std::shared_ptr<CommitmentKey<curve::BN254>>& bn254_commitment_key = nullptr)
    { // Mocks the interaction of a first circuit with the op queue due to the inability to currently handle zero
      // commitments (https://github.com/AztecProtocol/barretenberg/issues/871) which would otherwise appear in the
      // first round of the merge protocol. To be removed once the issue has been resolved.
        commitment_key = bn254_commitment_key ? bn254_commitment_key : nullptr;
    }

    void recursive_goblin_prove()
    {
        auto eccvm_builder = std::make_unique<ECCVMBuilder>(op_queue);
        eccvm_prover = std::make_unique<ECCVMProver>(*eccvm_builder);

        PROFILE_THIS_NAME("Construct ECCVM Proof");

        eccvm_proof = eccvm_prover->construct_proof();

        PROFILE_THIS_NAME("Assign Translation Evaluations");

        translation_evaluations = eccvm_prover->translation_evaluations;

        {
            fq translation_batching_challenge_v = eccvm_prover->translation_batching_challenge_v;
            fq evaluation_challenge_x = eccvm_prover->evaluation_challenge_x;
            std::shared_ptr<NativeTranscript> transcript = eccvm_prover->transcript;
            eccvm_key = eccvm_prover->key;
            eccvm_prover = nullptr;
            {

                PROFILE_THIS_NAME("Create TranslatorBuilder and TranslatorProver");

                auto translator_builder = std::make_unique<TranslatorBuilder>(
                    translation_batching_challenge_v, evaluation_challenge_x, op_queue);
                translator_prover = std::make_unique<TranslatorProver>(*translator_builder, transcript, commitment_key);
            }

            {

                PROFILE_THIS_NAME("Construct Translator Proof");

                translator_proof = translator_prover->construct_proof();
            }
        }
    }
    GoblinRecursiveVerifierOutput recursive_goblin_verify(UltraCircuitBuilder* builder)

    {
        // Run the ECCVM recursive verifier
        std::cout << "AA" << std::endl;
        const std::shared_ptr<GoblinVerifier::ECCVMVerificationKey> eccvm_vk =
            std::make_shared<GoblinVerifier::ECCVMVerificationKey>(eccvm_key);

        const std::shared_ptr<GoblinVerifier::TranslatorVerificationKey> translator_vk =
            std::make_shared<GoblinVerifier::TranslatorVerificationKey>(translator_prover->key);

        ECCVMVerifier eccvm_verifier{ builder, eccvm_vk };
        std::cout << "BB" << std::endl;

        auto [opening_claim, ipa_transcript] = eccvm_verifier.verify_proof(eccvm_proof);
        std::cout << "CC" << std::endl;

        TranslatorVerifier translator_verifier{ builder, translator_vk, eccvm_verifier.transcript };
        // TODO TAKE THE PAIRING POINT OUTPUTS AND ACCUMULATE
        std::cout << "DD" << std::endl;

        translator_verifier.verify_proof(translator_proof);
        std::cout << "EE" << std::endl;

        // Verify the consistency between the ECCVM and Translator transcript polynomial evaluations
        // In reality the Goblin Proof is going to already be a stdlib proof and this conversion is not going to happen
        // here (see https://github.com/AztecProtocol/barretenberg/issues/991)
        auto native_translation_evaluations = translation_evaluations;
        auto translation_evaluations =
            TranslationEvaluations{ TranslatorBF::from_witness(builder, native_translation_evaluations.op),
                                    TranslatorBF::from_witness(builder, native_translation_evaluations.Px),
                                    TranslatorBF::from_witness(builder, native_translation_evaluations.Py),
                                    TranslatorBF::from_witness(builder, native_translation_evaluations.z1),
                                    TranslatorBF::from_witness(builder, native_translation_evaluations.z2)

            };
        std::cout << "FF" << std::endl;

        translator_verifier.verify_translation(translation_evaluations);
        std::cout << "GG" << std::endl;
        return { opening_claim, ipa_transcript };
    }

    using RecursiveFlavor = AvmRecursiveFlavor_<MegaCircuitBuilder>;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using RecursiveVerifier = bb::avm::AvmRecursiveVerifier_<RecursiveFlavor>;

    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = bb::avm::AvmCircuitBuilder;
    using InnerProver = bb::avm::AvmProver;
    using InnerVerifier = bb::avm::AvmVerifier;
    using InnerComposer = bb::avm::AvmComposer;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using OuterFF = RecursiveFlavor::FF;
    using FinalRecursiveFlavor = MegaRecursiveFlavor_<UltraCircuitBuilder>;

    using FinalRecursiveVerifier = UltraRecursiveVerifier_<FinalRecursiveFlavor>;
    using RecursiveAVMDeciderProvingKey = DeciderProvingKey_<MegaFlavor>;

    using FinalFF = FinalRecursiveFlavor::FF;

    // TODO propagate the ultra public inputs into mega public inputs
    auto compute_full_avm_recursion(
        UltraCircuitBuilder* builder,
        const std::vector<FinalFF>& proof_fields,
        const std::vector<std::vector<FinalFF>>& public_inputs_vec,
        const std::shared_ptr<typename RecursiveFlavor::NativeFlavor::VerificationKey>& recursive_verification_key)
    {

        std::cout << "A" << std::endl;
        // bool verified = verifier.verify_proof(proof, public_inputs_vec);
        // ASSERT_TRUE(verified) << "native proof verification failed";

        // Create the outer verifier, to verify the proof

        MegaCircuitBuilder outer_circuit(op_queue);
        auto input_agg_obj =
            stdlib::recursion::init_default_aggregation_state<MegaCircuitBuilder, typename RecursiveFlavor::Curve>(
                outer_circuit);

        RecursiveVerifier recursive_verifier{ &outer_circuit, recursive_verification_key };

        std::cout << "B" << std::endl;

        // TODO: do this properly
        std::vector<OuterFF> proof_fields_mega;
        for (auto& x : proof_fields) {
            proof_fields_mega.push_back(OuterFF::from_witness(&outer_circuit, x.get_value()));
        }
        std::vector<std::vector<OuterFF>> public_inputs_mega;
        for (auto& x : public_inputs_vec) {
            std::vector<OuterFF> vec;
            for (auto& y : x) {
                vec.push_back(OuterFF::from_witness(&outer_circuit, y.get_value()));
            }
            public_inputs_mega.push_back(vec);
        }
        std::cout << "C" << std::endl;

        // TODO propagate into public inputs
        [[maybe_unused]] auto output_agg_object =
            recursive_verifier.verify_proof(proof_fields_mega, public_inputs_mega, input_agg_obj);

        std::cout << "D" << std::endl;
        recursive_goblin_prove();
        std::cout << "E" << std::endl;

        GoblinRecursiveVerifierOutput goblin_output = recursive_goblin_verify(builder);
        std::cout << "F" << std::endl;

        auto avm_recursion_proving_key = std::make_shared<RecursiveAVMDeciderProvingKey>(outer_circuit);
        UltraProver_<MegaFlavor> outer_prover(avm_recursion_proving_key);
        auto verification_key =
            std::make_shared<typename MegaFlavor::VerificationKey>(avm_recursion_proving_key->proving_key);
        auto outer_proof = outer_prover.construct_proof();
        std::cout << "G" << std::endl;

        FinalRecursiveVerifier verifier{ builder, verification_key };

        auto dummy_agg_object =
            stdlib::recursion::init_default_aggregation_state<UltraCircuitBuilder,
                                                              typename FinalRecursiveFlavor::Curve>(*builder);

        std::cout << "GB" << std::endl;
        auto final_agg_object = verifier.verify_proof(outer_proof, dummy_agg_object);
        std::cout << "H" << std::endl;

        // TODO also return the goblin plonk claims
        return final_agg_object;
    }
};
} // namespace bb::stdlib::recursion::honk

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;

// class AVMRecursion {
//   public:
//     using Builder = bb::GoblinProver::Builder;
//     using RecursiveFlavor = AvmRecursiveFlavor_<bb::GoblinProver::Builder>;
//     using AVMRecursiveVerifier = bb::avm::AvmRecursiveVerifier_<RecursiveFlavor>;
//     using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
//     using InnerBuilder = bb::avm::AvmCircuitBuilder;
//     using InnerProver = bb::avm::AvmProver;
//     using InnerVerifier = bb::avm::AvmVerifier;
//     using InnerComposer = bb::avm::AvmComposer;
//     using InnerG1 = InnerFlavor::Commitment;
//     using InnerFF = InnerFlavor::FF;

//     using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
//     using OuterProver = UltraProver;
//     using OuterVerifier = UltraVerifier;
//     using OuterDeciderProvingKey = DeciderProvingKey_<UltraFlavor>;
//     using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
//     using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;

//     void verify_goblin_proof(HonkProof& proof,
//                              std::vector<std::vector<InnerFF>>& public_inputs_vec,
//                              const std::shared_ptr<InnerFlavor::VerificationKey> verification_key) const
//     {
//         GoblinProver goblin;
//         OuterBuilder outer_circuit(goblin.op_queue);
//         AVMRecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };

//         auto agg_object =
//             stdlib::recursion::init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(
//                 outer_circuit);

//         auto agg_output = recursive_verifier.verify_proof(proof, public_inputs_vec, agg_object);

//         bool agg_output_valid =
//             verification_key->pcs_verification_key->pairing_check(agg_output.P0.get_value(),
//             agg_output.P1.get_value());

//         ASSERT(agg_output_valid);
//         // At this point we have a circuit that verifies an AVM proof
//         // We need the following:
//         // 1: a proof of the AVM circuit
//         // 2: an eccvm proof of the transcript from the AVM circuit builder
//         // 3: a translator proof of the transcript from the AVM circuit builder

//         // 1. Make a proof of the verification of an AVM proof
//         const size_t srs_size = 1 << 23;
//         auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(
//             outer_circuit, TraceSettings{}, std::make_shared<bb::CommitmentKey<curve::BN254>>(srs_size));

//         OuterProver ultra_prover(ultra_instance);
//         auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
//         OuterVerifier ultra_verifier(ultra_verification_key);

//         auto recursion_proof = ultra_prover.construct_proof();
//         bool recursion_verified = ultra_verifier.verify_proof(recursion_proof);
//         ASSERT(recursion_verified);
//         // 2. eccvm
//         GoblinProof g_proof = goblin.prove();

//         // Verify the goblin proof (eccvm, translator, merge); (Construct ECCVM/Translator verification keys from
//         their
//         // respective proving keys)
//         auto eccvm_vkey = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
//         auto translator_vkey = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());
//         GoblinVerifier goblin_verifier{ eccvm_vkey, translator_vkey };
//         bool verified = goblin_verifier.verify(g_proof);
//         ASSERT(verified);
//     }
// };
// class AVMGoblinProver : public bb::GoblinProver {
//   public:
//     using RecursiveFlavor = AvmRecursiveFlavor_<Builder>;
//     using AVMRecursiveVerifier = bb::avm::AvmRecursiveVerifier_<RecursiveFlavor>;
//     using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
//     using InnerBuilder = bb::avm::AvmCircuitBuilder;
//     using InnerProver = bb::avm::AvmProver;
//     using InnerVerifier = bb::avm::AvmVerifier;
//     using InnerComposer = bb::avm::AvmComposer;
//     using InnerG1 = InnerFlavor::Commitment;
//     using InnerFF = InnerFlavor::FF;

//     using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
//     using OuterProver = UltraProver_<MegaFlavor>;
//     using OuterVerifier = UltraVerifier_<MegaFlavor>;
//     using OuterDeciderProvingKey = DeciderProvingKey_<MegaFlavor>;

//     PairingPoints verify_goblin_merge(Builder& outer_circuit,
//                                       MergeProof& proof,
//                                       const std::shared_ptr<InnerFlavor::VerificationKey> verification_key,
//                                       std::vector<std::vector<InnerFF>>& public_inputs_vec) const
//     {
//         // we are verifying an inner proof
//         // blah blah blah
//         AVMRecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };
//         auto agg_object =
//             stdlib::recursion::init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(
//                 outer_circuit);

//         auto agg_output = recursive_verifier.verify_proof(proof, public_inputs_vec, agg_object);

//         // ooook so...
//         // we need to do 2 things
//         // 1: perform a "standard" recursive verification where ecc ops get shoved into a circuit builder queue
//         // 2: call merge verifier on the ecc builder queue
//         // see client_ivc.cpp ClientIVC::complete_kernel_circuit_logic

//         // this is where we need to change things? we can't return pairing points we need to return data blob

//         // ok soooo here's what I think so far.
//         // we actually keep the recursive verification the same as original AVM, including returning the agg_output
//         // However we ALSO include a merge verifier step
//         // and create a combined accumulator object
//         return agg_output;
//         PROFILE_THIS_NAME("Goblin::merge");
//         //  const std::shared_ptr<InnerFlavor::VerificationKey> verification_key = verifier.key;
//         //. OuterBuilder outer_circuit;
//         //   RecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };

//         // Make a proof of the verification of an AVM proof
//         //.  const size_t srs_size = 1 << 23;
//         // auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(
//         //     outer_circuit, TraceSettings{}, std::make_shared<bb::CommitmentKey<curve::BN254>>(srs_size));

//         // OuterProver ultra_prover(ultra_instance);
//         // auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);

//         // auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
//         // OuterVerifier ultra_verifier(ultra_verification_key);

//         //   AVMRecursiveVerifier merge_verifier(ultra_verification_key);
//         // return merge_verifier.verify_proof(proof);
//     };

//     void avm_merge(Builder& circuit_builder)
//     {
//         // Append a recursive merge verification of the merge proof
//         if (merge_proof_exists) {
//             [[maybe_unused]] auto pairing_points = verify_goblin_merge(circuit_builder, merge_proof);
//         }

//         // Construct a merge proof for the present circuit
//         merge_proof = prove_merge(circuit_builder);
//     };
// };

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

    gverifier.verify(g_proof);
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

TEST_F(AvmRecursiveTests, recursion2)
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

    bb::stdlib::recursion::honk::AVMGoblin avmgoblin;

    UltraCircuitBuilder builder;

    // auto fields_from_witnesses = [&](std::vector<uint32_t> const& input) {
    //     std::vector<OuterFF> result;
    //     result.reserve(input.size());
    //     for (const auto& idx : input) {
    //         auto field = OuterFF::from_witness_index(&builder, idx);
    //         result.emplace_back(field);
    //     }
    //     return result;
    // };

    // const auto proof_fields = fields_from_witnesses(proof);
    // const auto public_inputs_flattened = fields_from_witnesses(input.public_inputs);

    // auto it = public_inputs_flattened.begin();
    // VmPublicInputs vm_public_inputs =
    //     avm_trace::convert_public_inputs(std::vector(it, it + PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH));
    // it += PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH;
    // std::vector<field_ct> calldata(it, it + AVM_PUBLIC_COLUMN_MAX_SIZE);
    // it += AVM_PUBLIC_COLUMN_MAX_SIZE;
    // std::vector<field_ct> return_data(it, it + AVM_PUBLIC_COLUMN_MAX_SIZE);

    // auto public_inputs_vectors = avm_trace::copy_public_inputs_columns(vm_public_inputs, calldata, return_data);

    UltraCircuitBuilder outer_circuit;

    std::vector<OuterFF> proof_fields;
    for (auto& field : proof) {
        proof_fields.emplace_back(OuterFF::from_witness(&outer_circuit, field));
    }
    std::vector<std::vector<OuterFF>> public_inputs_vec_fields;
    for (auto& x : public_inputs_vec) {
        std::vector<OuterFF> vec;
        for (auto& y : x) {
            vec.emplace_back(OuterFF::from_witness(&outer_circuit, y));
        }
        public_inputs_vec_fields.emplace_back(vec);
    }
    // std::vector<OuterFF> public_inputs_fields;

    avmgoblin.compute_full_avm_recursion(&outer_circuit, proof_fields, public_inputs_vec_fields, verification_key);

    std::cout << "I" << std::endl;
    {
        auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
        OuterProver prover(proving_key);
        auto verification_key = std::make_shared<typename UltraFlavor::VerificationKey>(proving_key->proving_key);
        OuterVerifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);
        EXPECT_TRUE(verified);
    }

    //     ASSERT(verified);
    // GoblinProver goblin;
    // MegaCircuitBuilder outer_circuit(goblin.op_queue);
    // RecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };

    // auto agg_object =
    //     stdlib::recursion::init_default_aggregation_state<MegaCircuitBuilder, typename RecursiveFlavor::Curve>(
    //         outer_circuit);

    // auto agg_output = recursive_verifier.verify_proof(proof, public_inputs_vec, agg_object);

    // bool agg_output_valid =
    //     verification_key->pcs_verification_key->pairing_check(agg_output.P0.get_value(), agg_output.P1.get_value());

    // ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    // ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    // bool outer_circuit_checked = CircuitChecker::check(outer_circuit);
    // ASSERT_TRUE(outer_circuit_checked) << "outer circuit check failed";

    // std::cout << "A" << std::endl;
    // auto manifest = verifier.transcript->get_manifest();
    // auto recursive_manifest = recursive_verifier.transcript->get_manifest();
    // std::cout << "B" << std::endl;

    // EXPECT_EQ(manifest.size(), recursive_manifest.size());
    // for (size_t i = 0; i < recursive_manifest.size(); ++i) {
    //     EXPECT_EQ(recursive_manifest[i], manifest[i]);
    // }

    // for (auto const [key_el, rec_key_el] : zip_view(verifier.key->get_all(), recursive_verifier.key->get_all())) {
    //     EXPECT_EQ(key_el, rec_key_el.get_value());
    // }

    // EXPECT_EQ(verifier.key->circuit_size, recursive_verifier.key->circuit_size);
    // EXPECT_EQ(verifier.key->num_public_inputs, recursive_verifier.key->num_public_inputs);

    // // in goblin test...
    // // there are several mega circuits being generated
    // // goblin proof is then constructed from the mega circuits

    // // what is a goblin proof?
    // // eccvm proof, translator proof and a "merge" proof
    // // what is the merge proof?

    // // `goblin.verify_merge` is called using a client builder input
    // // input is a mega circuit
    // // eww
    // // The next step is...
    // // An UltraBuilder is created
    // // The UltraBuilder is used to create a circuit that verifies the goblin proof
    // std::cout << "C" << std::endl;
    // goblin.merge(outer_circuit);

    // GoblinProof g_proof = goblin.prove();
    // std::cout << "D" << std::endl;

    // // Verify the goblin proof (eccvm, translator, merge); (Construct ECCVM/Translator verification keys from their
    // // respective proving keys)
    // auto eccvm_vkey = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
    // auto translator_vkey = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());
    // std::cout << "E" << std::endl;

    // UltraCircuitBuilder builder;
    // GoblinVerifier::VerifierInput goblin_vinput{ std::make_shared<ECCVMVK>(goblin.get_eccvm_proving_key()),
    //                                              std::make_shared<TranslatorVK>(goblin.get_translator_proving_key())
    //                                              };
    // bb::stdlib::recursion::honk::GoblinRecursiveVerifier gverifier{ &builder, goblin_vinput };
    // std::cout << "F" << std::endl;

    // // next step fails likely because of a lack of a merge proof

    // gverifier.verify(g_proof);
    // std::cout << "G" << std::endl;

    // EXPECT_EQ(builder.failed(), false) << builder.err();
    // EXPECT_TRUE(CircuitChecker::check(builder));
    // // Construct and verify a proof for the Goblin Recursive Verifier circuit
    // {
    //     auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
    //     OuterProver prover(proving_key);
    //     auto verification_key = std::make_shared<typename UltraFlavor::VerificationKey>(proving_key->proving_key);
    //     OuterVerifier verifier(verification_key);
    //     auto proof = prover.construct_proof();
    //     bool verified = verifier.verify_proof(proof);

    //     ASSERT(verified);
    // }

    // // const size_t srs_size = 1 << 23;
    // auto ultra_instance = std::make_shared<MegaDeciderProvingKey>(outer_circuit);
    // MegaProver ultra_prover(ultra_instance);
    // auto ultra_verification_key = std::make_shared<MegaFlavor::VerificationKey>(ultra_instance->proving_key);
    // MegaVerifier ultra_verifier(ultra_verification_key);

    // vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    // auto recursion_proof = ultra_prover.construct_proof();
    // bool recursion_verified = ultra_verifier.verify_proof(recursion_proof);
    // EXPECT_TRUE(recursion_verified) << "recursion proof verification failed";

    // // Make a proof of the verification of an AVM proof
    // // const size_t srs_size = 1 << 23;
    // // auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(
    // //     outer_circuit, TraceSettings{}, std::make_shared<bb::CommitmentKey<curve::BN254>>(srs_size));
    // // auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(outer_circuit);

    // // OuterProver ultra_prover(ultra_instance);
    // // auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    // // OuterVerifier ultra_verifier(ultra_verification_key);

    // // // //  auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);

    // // // OuterProver outer_prover(ultra_instance);

    // // // goblin.merge(outer_circit);
    // // // auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    // // // GoblinVerifier ultra_verifier(ultra_verification_key);

    // // vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    // // auto recursion_proof = ultra_prover.construct_proof();
    // // bool recursion_verified = ultra_verifier.verify_proof(recursion_proof);
    // // EXPECT_TRUE(recursion_verified) << "recursion proof verification failed";

    // // GoblinProof g_proof = goblin.prove();

    // // // Verify the goblin proof (eccvm, translator, merge); (Construct ECCVM/Translator verification keys from
    // their
    // // // respective proving keys)
    // // auto eccvm_vkey = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
    // // auto translator_vkey = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());
    // // GoblinVerifier goblin_verifier{ eccvm_vkey, translator_vkey };
    // // bool g_verified = goblin_verifier.verify(g_proof);
    // // EXPECT_TRUE(g_verified);
}
} // namespace tests_avm
