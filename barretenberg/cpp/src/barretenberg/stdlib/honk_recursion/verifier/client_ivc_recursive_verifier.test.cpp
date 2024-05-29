#include "barretenberg/stdlib/honk_recursion/verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/test.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIvcRecursionTests : public testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using ClientIvcVerifier = ClientIvcRecursiveVerifier_;
    using VerifierInput = ClientIvcVerifier::FoldingVerifier::VerifierInput;
    using VerifierInstance = VerifierInput::Instance;

    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    struct ClientIvcProverOutput {
        ClientIVC::Proof proof;
        VerifierInput verifier_input;
    };

    /**
     * @brief Construct a genuine ClientIvc prover output based on accumulation of an arbitrary set of mock circuits
     *
     */
    static ClientIvcProverOutput construct_client_ivc_prover_output(ClientIVC& ivc)
    {
        using Builder = ClientIVC::ClientCircuit;

        size_t NUM_CIRCUITS = 3;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            Builder circuit{ ivc.goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(circuit);
            ivc.accumulate(circuit);
        }

        return { ivc.prove(), { ivc.verifier_accumulator, { ivc.instance_vk } } };
    }
};

TEST_F(ClientIvcRecursionTests, NativeVerification)
{
    ClientIVC ivc;
    auto [proof, verifier_input] = construct_client_ivc_prover_output(ivc);

    // Construct the set of native verifier instances to be processed by the folding verifier
    std::vector<std::shared_ptr<VerifierInstance>> instances{ verifier_input.accumulator };
    for (auto vk : verifier_input.instance_vks) {
        instances.emplace_back(std::make_shared<VerifierInstance>(vk));
    }

    EXPECT_TRUE(ivc.verify(proof, instances));
}

TEST_F(ClientIvcRecursionTests, Basic)
{
    ClientIVC ivc;
    auto [proof, verifier_input] = construct_client_ivc_prover_output(ivc);

    Builder builder;
    ClientIvcVerifier verifier{ &builder };

    verifier.verify(proof, verifier_input);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace bb::stdlib::recursion::honk