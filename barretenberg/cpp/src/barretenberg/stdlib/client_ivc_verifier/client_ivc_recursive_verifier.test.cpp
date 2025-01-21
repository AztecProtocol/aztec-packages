#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/test_bench_shared.hpp"
#include "barretenberg/common/test.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIVCRecursionTests : public testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using ClientIVCVerifier = ClientIVCRecursiveVerifier;
    using FoldVerifierInput = ClientIVCVerifier::FoldVerifierInput;
    using Proof = ClientIVC::Proof;
    using RollupFlavor = UltraRollupRecursiveFlavor_<Builder>;
    using NativeFlavor = RollupFlavor::NativeFlavor;
    using UltraRecursiveVerifier = UltraRecursiveVerifier_<RollupFlavor>;
    using MockCircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
    using IVCVerificationKey = ClientIVC::VerificationKey;

    static constexpr TraceSettings trace_settings{ CLIENT_IVC_BENCH_STRUCTURE };

    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    }

    struct ClientIVCProverOutput {
        Proof proof;
        IVCVerificationKey ivc_vk;
    };

    /**
     * @brief Construct a genuine ClientIVC prover output based on accumulation of an arbitrary set of mock circuits
     *
     */
    static ClientIVCProverOutput construct_client_ivc_prover_output(ClientIVC& ivc)
    {
        // Construct and accumulate a series of mocked private function execution circuits
        MockCircuitProducer circuit_producer;
        size_t NUM_CIRCUITS = 2;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto circuit = circuit_producer.create_next_circuit(ivc);
            ivc.accumulate(circuit);
        }

        return { ivc.prove(), ivc.get_vk() };
    }
};

/**
 * @brief Ensure the ClientIVC proof used herein can be natively verified
 *
 */
TEST_F(ClientIVCRecursionTests, NativeVerification)
{
    ClientIVC ivc{ trace_settings };
    auto [proof, ivc_vk] = construct_client_ivc_prover_output(ivc);

    // Confirm that the IVC proof can be natively verified
    EXPECT_TRUE(ivc.verify(proof));
}

/**
 * @brief Construct and Check a recursive ClientIVC verification circuit
 *
 */
TEST_F(ClientIVCRecursionTests, Basic)
{
    using CIVCRecVerifierOutput = ClientIVCRecursiveVerifier::Output;

    // Generate a genuine ClientIVC prover output
    ClientIVC ivc{ trace_settings };
    auto [proof, ivc_vk] = construct_client_ivc_prover_output(ivc);

    // Construct the ClientIVC recursive verifier
    auto builder = std::make_shared<Builder>();
    ClientIVCVerifier verifier{ builder, ivc_vk };

    // Generate the recursive verification circuit
    CIVCRecVerifierOutput output = verifier.verify(proof);

    EXPECT_EQ(builder->failed(), false) << builder->err();

    EXPECT_TRUE(CircuitChecker::check(*builder));

    // Print the number of gates post finalisation
    info("Recursive Verifier: finalised num gates = ", builder->num_gates);
}

TEST_F(ClientIVCRecursionTests, ClientTubeBase)
{
    using CIVCRecVerifierOutput = ClientIVCRecursiveVerifier::Output;

    // Generate a genuine ClientIVC prover output
    ClientIVC ivc{ trace_settings };
    auto [proof, ivc_vk] = construct_client_ivc_prover_output(ivc);

    // Construct the ClientIVC recursive verifier
    auto tube_builder = std::make_shared<Builder>();
    ClientIVCVerifier verifier{ tube_builder, ivc_vk };

    // Generate the recursive verification circuit
    CIVCRecVerifierOutput client_ivc_rec_verifier_output = verifier.verify(proof);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1069): fix this by taking it from the output instead of
    // just using default.
    tube_builder->add_pairing_point_accumulator(
        stdlib::recursion::init_default_agg_obj_indices<Builder>(*tube_builder));
    // The tube only calls an IPA recursive verifier once, so we can just add this IPA claim and proof
    tube_builder->add_ipa_claim(client_ivc_rec_verifier_output.opening_claim.get_witness_indices());
    tube_builder->ipa_proof = convert_stdlib_proof_to_native(client_ivc_rec_verifier_output.ipa_transcript->proof_data);

    info("ClientIVC Recursive Verifier: num prefinalized gates = ", tube_builder->num_gates);

    EXPECT_EQ(tube_builder->failed(), false) << tube_builder->err();

    // EXPECT_TRUE(CircuitChecker::check(*tube_builder));

    // Construct and verify a proof for the ClientIVC Recursive Verifier circuit
    auto proving_key = std::make_shared<DeciderProvingKey_<NativeFlavor>>(*tube_builder);
    UltraProver_<NativeFlavor> tube_prover{ proving_key };
    auto native_tube_proof = tube_prover.construct_proof();

    // Natively verify the tube proof
    auto native_vk_with_ipa = std::make_shared<NativeFlavor::VerificationKey>(proving_key->proving_key);
    auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    UltraVerifier_<NativeFlavor> native_verifier(native_vk_with_ipa, ipa_verification_key);
    EXPECT_TRUE(native_verifier.verify_proof(native_tube_proof, tube_prover.proving_key->proving_key.ipa_proof));

    // Construct a base rollup circuit that recursively verifies the tube proof and forwards the IPA proof.
    Builder base_builder;
    auto native_vk = std::make_shared<NativeFlavor::VerificationKey>(proving_key->proving_key);
    auto tube_vk = std::make_shared<RollupFlavor::VerificationKey>(&base_builder, native_vk);
    auto tube_proof = bb::convert_native_proof_to_stdlib(&base_builder, native_tube_proof);
    UltraRecursiveVerifier base_verifier{ &base_builder, tube_vk };
    UltraRecursiveVerifierOutput<RollupFlavor> output = base_verifier.verify_proof(
        tube_proof, stdlib::recursion::init_default_aggregation_state<Builder, RollupFlavor::Curve>(base_builder));
    info("Tube UH Recursive Verifier: num prefinalized gates = ", base_builder.num_gates);
    base_builder.add_pairing_point_accumulator(output.agg_obj.get_witness_indices());
    base_builder.add_ipa_claim(output.ipa_opening_claim.get_witness_indices());
    base_builder.ipa_proof = tube_prover.proving_key->proving_key.ipa_proof;
    EXPECT_EQ(base_builder.failed(), false) << base_builder.err();
    EXPECT_TRUE(CircuitChecker::check(base_builder));

    // Natively verify the IPA proof for the base rollup circuit
    auto base_proving_key = std::make_shared<DeciderProvingKey_<NativeFlavor>>(base_builder);
    auto ipa_transcript = std::make_shared<NativeTranscript>(base_proving_key->proving_key.ipa_proof);
    IPA<curve::Grumpkin>::reduce_verify(
        ipa_verification_key, output.ipa_opening_claim.get_native_opening_claim(), ipa_transcript);
}

} // namespace bb::stdlib::recursion::honk