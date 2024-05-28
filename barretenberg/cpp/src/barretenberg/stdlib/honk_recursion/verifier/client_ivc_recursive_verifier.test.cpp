#include "barretenberg/stdlib/honk_recursion/verifier/client_ivc_recursive_verifier.hpp"
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
        ClientIVC::Proof proof;
        std::vector<std::shared_ptr<VerifierInstance>> verifier_instances;
    };

    static ClientIvcProverOutput construct_mock_client_ivc_output(ClientIVC& ivc)
    {
        using Builder = MegaCircuitBuilder;
        using Flavor = MegaFlavor;
        using VerifierInstance = VerifierInstance_<Flavor>;

        size_t NUM_CIRCUITS = 3;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            Builder circuit{ ivc.goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(circuit);
            ivc.accumulate(circuit);
        }

        auto verifier_inst = std::make_shared<VerifierInstance>(ivc.instance_vk);

        return { ivc.prove(), { ivc.verifier_accumulator, verifier_inst } };
    }
};

TEST_F(ClientIvcRecursionTests, NativeVerification)
{
    ClientIVC ivc;
    auto [proof, verifier_instances] = construct_mock_client_ivc_output(ivc);

    bool result = ivc.verify(proof, verifier_instances);
    EXPECT_TRUE(result);
}

} // namespace bb::stdlib::recursion::honk