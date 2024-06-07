#include "barretenberg/stdlib/honk_recursion/verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/bb/file_io.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/test.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIVCRecursionTests : public testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using ClientIVCVerifier = ClientIVCRecursiveVerifier;
    using VerifierInput = ClientIVCVerifier::VerifierInput;
    using FoldVerifierInput = ClientIVCVerifier::FoldVerifierInput;
    using GoblinVerifierInput = ClientIVCVerifier::GoblinVerifierInput;
    using VerifierInstance = FoldVerifierInput::Instance;
    using ECCVMVK = GoblinVerifier::ECCVMVerificationKey;
    using TranslatorVK = GoblinVerifier::TranslatorVerificationKey;
    using Proof = ClientIVC::Proof;

    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    struct ClientIVCProverOutput {
        Proof proof;
        VerifierInput verifier_input;
    };

    /**
     * @brief Construct a genuine ClientIVC prover output based on accumulation of an arbitrary set of mock circuits
     *
     */
    static ClientIVCProverOutput construct_client_ivc_prover_output(ClientIVC& ivc)
    {
        using Builder = ClientIVC::ClientCircuit;

        size_t NUM_CIRCUITS = 3;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            Builder circuit{ ivc.goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(circuit);
            ivc.accumulate(circuit);
        }

        Proof proof = ivc.prove();
        FoldVerifierInput fold_verifier_input{ ivc.verifier_accumulator, { ivc.instance_vk } };
        GoblinVerifierInput goblin_verifier_input{ std::make_shared<ECCVMVK>(ivc.goblin.get_eccvm_proving_key()),
                                                   std::make_shared<TranslatorVK>(
                                                       ivc.goblin.get_translator_proving_key()) };

        return { proof, { fold_verifier_input, goblin_verifier_input } };
    }

    static ClientIVC::Proof construct_client_ivc_proof(ClientIVC& ivc)
    {
        using Builder = ClientIVC::ClientCircuit;

        size_t NUM_CIRCUITS = 3;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            Builder circuit{ ivc.goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(circuit);
            ivc.accumulate(circuit);
        }

        Proof proof = ivc.prove();

        return proof;
    }
};

// /**
//  * @brief Ensure the ClientIVC proof used herein can be natively verified
//  *
//  */
// TEST_F(ClientIVCRecursionTests, NativeVerification)
// {
//     ClientIVC ivc;
//     auto [proof, verifier_input] = construct_client_ivc_prover_output(ivc);

//     // Construct the set of native verifier instances to be processed by the folding verifier
//     std::vector<std::shared_ptr<VerifierInstance>> instances{ verifier_input.fold_input.accumulator };
//     for (auto vk : verifier_input.fold_input.instance_vks) {
//         instances.emplace_back(std::make_shared<VerifierInstance>(vk));
//     }

//     // Confirm that the IVC proof can be natively verified
//     EXPECT_TRUE(ivc.verify(proof, instances));
// }

/**
 * @brief Construct and Check a recursive ClientIVC verification circuit
 *
 */
// TEST_F(ClientIVCRecursionTests, Basic)
// {
//     // Generate a genuine ClientIVC prover output
//     ClientIVC ivc;
//     auto [proof, verifier_input] = construct_client_ivc_prover_output(ivc);

//     // Construct the ClientIVC recursive verifier
//     auto builder = std::make_shared<Builder>();
//     ClientIVCVerifier verifier{ builder, verifier_input };

//     // Generate the recursive verification circuit
//     verifier.verify(proof);
//     info("num gates: ", builder->get_num_gates());

//     EXPECT_TRUE(CircuitChecker::check(*builder));
// }

TEST_F(ClientIVCRecursionTests, Proof)
{
    using InstanceFlavor = MegaFlavor;
    using ECCVMVk = ECCVMFlavor::VerificationKey;
    using TranslatorVk = TranslatorFlavor::VerificationKey;

    // Generate a genuine ClientIVC prover output
    ClientIVC ivc;
    auto proof1 = construct_client_ivc_proof(ivc);

    std::string vkPath = "./inst_vk"; // the vk of the last instance
    std::string accPath = "./pg_acc";
    std::string proofPath = "./proof";
    std::string translatorVkPath = "./translator_vk";
    std::string eccVkPath = "./ecc_vk";

    auto accumulator1 = ivc.verifier_accumulator;
    // info("accumulator size", accumulator1->verification_key->circuit_size);
    auto inst_vk1 = ivc.instance_vk;
    // info("inst size", inst_vk1->circuit_size);
    auto eccvm_vk1 = std::make_shared<ECCVMVK>(ivc.goblin.get_eccvm_proving_key());

    // info("eccvm size", eccvm_vk1->circuit_size);
    auto translator_vk1 = std::make_shared<TranslatorVK>(ivc.goblin.get_translator_proving_key());
    info("translator");
    info(translator_vk1->circuit_size);
    info(translator_vk1->log_circuit_size);
    info(translator_vk1->num_public_inputs);
    info(translator_vk1->pub_inputs_offset);

    for (auto comm : translator_vk1->get_all()) {
        info(comm, " on curve:", comm.on_curve(), " infinity ", comm.is_point_at_infinity());
    }
    // info("translator vk", translator_vk1->circuit_size);
    // LONDONTODO: we can remove this
    auto last_instance1 = std::make_shared<ClientIVC::VerifierInstance>(inst_vk1);

    write_file(proofPath, to_buffer(proof1));

    write_file(vkPath, to_buffer(inst_vk1)); // maybe dereference
    write_file(accPath, to_buffer(accumulator1));

    write_file(translatorVkPath, to_buffer(translator_vk1));

    write_file(eccVkPath, to_buffer(eccvm_vk1));

    auto proof = from_buffer<ClientIVC::Proof>(read_file(proofPath));
    auto instance_vk = std::make_shared<InstanceFlavor::VerificationKey>(
        from_buffer<InstanceFlavor::VerificationKey>(read_file(vkPath)));
    auto verifier_accumulator =
        std::make_shared<ClientIVC::VerifierInstance>(from_buffer<ClientIVC::VerifierInstance>(read_file(accPath)));
    auto translator_vk = std::make_shared<TranslatorVk>(from_buffer<TranslatorVk>(read_file(translatorVkPath)));
    auto eccvm_vk = std::make_shared<ECCVMVk>(from_buffer<ECCVMVk>(read_file(eccVkPath)));
    eccvm_vk->pcs_verification_key = eccvm_vk1->pcs_verification_key;
    info("now here");
    info(translator_vk->circuit_size);
    info(translator_vk->log_circuit_size);
    info(translator_vk->num_public_inputs);
    info(translator_vk->pub_inputs_offset);
    for (auto comm : translator_vk->get_all()) {
        info(comm, " ", comm.on_curve());
    }

    FoldVerifierInput fold_verifier_input{ verifier_accumulator, { instance_vk } };
    // Temporarily use initial vk for translator to check everything else works
    GoblinVerifierInput goblin_verifier_input{ eccvm_vk, translator_vk };
    VerifierInput input{ fold_verifier_input, goblin_verifier_input };

    // TODO: handle PCS stuff
    // auto verifier_inst = std::make_shared<VerifierInstance>(instance_vk);
    // auto verifier_inst1 = std::make_shared<VerifierInstance>(inst_vk1);
    // just the proof was deserialised - proof is fine
    // proof AND verifier inst (not acc!) - proof and vk are fine
    //  ivc.verify_special(proof, eccvm_vk, translator_vk, {
    // verifier_accumulator, verifier_inst });

    // Construct the ClientIVC recursive verifier
    //
    auto builder = std::make_shared<Builder>();
    ClientIVCVerifier verifier{ builder, input };

    // Generate the recursive verification circuit
    verifier.verify(proof);
    info("num gates: ", builder->get_num_gates());

    // EXPECT_TRUE(CircuitChecker::check(*builder));

    {
        using Prover = UltraProver_<UltraFlavor>;
        using Verifier = UltraVerifier_<UltraFlavor>;
        Prover prover{ *builder };
        auto tube_proof = prover.construct_proof();
        auto verification_key = std::make_shared<typename UltraFlavor::VerificationKey>(prover.instance->proving_key);

        Verifier verifier(verification_key);
        bool verified = verifier.verify_proof(tube_proof);
        ASSERT(verified);
    }
}

} // namespace bb::stdlib::recursion::honk