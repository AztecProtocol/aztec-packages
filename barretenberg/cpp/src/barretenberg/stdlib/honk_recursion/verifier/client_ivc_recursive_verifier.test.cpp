#include "barretenberg/stdlib/honk_recursion/verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/test.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIvcRecursionTests : public testing::Test {
  public:
    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    // WORKTODO: if this is really needed then move it to client_ivc or something
    struct ClientIvcProverOutput {
        using Flavor = MegaFlavor;
        using VerifierInstance = VerifierInstance_<Flavor>;
        using VerifierData = ClientIvcRecursiveVerifier_::VerifierData;
        ClientIVC::Proof proof;

        VerifierData verifier_data;
    };

    static ClientIvcProverOutput construct_mock_client_ivc_output(ClientIVC& ivc)
    {
        using Builder = MegaCircuitBuilder;
        // using Flavor = MegaFlavor;
        // using VerifierInstance = VerifierInstance_<Flavor>;

        size_t NUM_CIRCUITS = 3;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            Builder circuit{ ivc.goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(circuit);
            ivc.accumulate(circuit);
        }

        // auto verifier_inst = std::make_shared<VerifierInstance>(ivc.instance_vk);

        ClientIvcProverOutput output;
        output.proof = ivc.prove();
        output.verifier_data.verifier_accumulator_instance = ivc.verifier_accumulator;
        output.verifier_data.honk_verification_key = ivc.instance_vk;

        return output;
        // return { ivc.prove(), { ivc.verifier_accumulator, ivc.instance_vk } };
    }
};

TEST_F(ClientIvcRecursionTests, NativeVerification)
{
    ClientIVC ivc;
    auto [proof, verifier_instances] = construct_mock_client_ivc_output(ivc);

    using Flavor = MegaFlavor;
    using VerifierInstance = VerifierInstance_<Flavor>;

    auto verifier_inst = std::make_shared<VerifierInstance>(ivc.instance_vk);

    bool result = ivc.verify(proof, { ivc.verifier_accumulator, verifier_inst });
    EXPECT_TRUE(result);
}

TEST_F(ClientIvcRecursionTests, Basic)
{
    ClientIVC ivc;
    auto [proof, verifier_data] = construct_mock_client_ivc_output(ivc);

    using Flavor = MegaFlavor;
    using VerifierInstance = VerifierInstance_<Flavor>;

    // Native verification for good measure
    auto verifier_inst = std::make_shared<VerifierInstance>(ivc.instance_vk);

    bool result = ivc.verify(proof, { ivc.verifier_accumulator, verifier_inst });
    EXPECT_TRUE(result);

    UltraCircuitBuilder builder;
    ClientIvcRecursiveVerifier_ verifier{ &builder };

    verifier.verify(proof, verifier_data);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace bb::stdlib::recursion::honk