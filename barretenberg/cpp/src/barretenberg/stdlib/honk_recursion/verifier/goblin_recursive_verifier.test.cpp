#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/goblin.hpp"
// #include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
// #include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
// #include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
// #include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
// #include "barretenberg/stdlib/honk_recursion/verifier/decider_recursive_verifier.hpp"
// #include "barretenberg/stdlib/honk_recursion/verifier/protogalaxy_recursive_verifier.hpp"
// #include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/goblin_recursive_verifier.hpp"
// #include "barretenberg/sumcheck/instance/instances.hpp"
// #include "barretenberg/ultra_honk/decider_prover.hpp"
// #include "barretenberg/ultra_honk/ultra_prover.hpp"
// #include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class GoblinRecursiveVerifierTests : public testing::Test {
  public:
    using Builder = GoblinRecursiveVerifier::Builder;
    using ECCVMVK = GoblinVerifier::ECCVMVerificationKey;
    using TranslatorVK = GoblinVerifier::TranslatorVerificationKey;

    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    static MegaCircuitBuilder construct_mock_circuit(std::shared_ptr<ECCOpQueue> op_queue)
    {
        MegaCircuitBuilder circuit{ op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, /*target_log2_dyadic_size=*/8);
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }

    struct ProverOutput {
        GoblinProof proof;
        GoblinVerifier::VerifierInput verfier_input;
    };

    ProverOutput create_goblin_prover_output()
    {
        GoblinProver goblin;

        // Construct and accumulate multiple circuits
        size_t NUM_CIRCUITS = 3;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto circuit = construct_mock_circuit(goblin.op_queue);
            goblin.merge(circuit); // appends a recurisve merge verifier if a merge proof exists
        }

        // Output is a goblin proof plus ECCVM/Translator verification keys
        return { goblin.prove(),
                 { std::make_shared<ECCVMVK>(goblin.get_eccvm_proving_key()),
                   std::make_shared<TranslatorVK>(goblin.get_translator_proving_key()) } };
    }
};

/**
 * @brief Ensure the Goblin proof can be natively verified
 *
 */
TEST_F(GoblinRecursiveVerifierTests, NativeVerification)
{
    auto [proof, verifier_input] = create_goblin_prover_output();

    GoblinVerifier verifier{ verifier_input };

    EXPECT_TRUE(verifier.verify(proof));
}

TEST_F(GoblinRecursiveVerifierTests, Basic)
{
    auto [proof, verifier_input] = create_goblin_prover_output();

    Builder builder;
    GoblinRecursiveVerifier verifier{ &builder, verifier_input.translator_verification_key };
    verifier.verify(proof);

    EXPECT_EQ(builder.failed(), false) << builder.err();

    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace bb::stdlib::recursion::honk