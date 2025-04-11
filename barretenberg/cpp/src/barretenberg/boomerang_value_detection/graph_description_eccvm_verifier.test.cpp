#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/stdlib/test_utils/tamper_proof.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <gtest/gtest.h>

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}
namespace bb {
template <typename RecursiveFlavor> class ECCVMRecursiveTests : public ::testing::Test {
  public:
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerProver = ECCVMProver;
    using InnerVerifier = ECCVMVerifier;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerBF = InnerFlavor::BF;
    using InnerPK = InnerFlavor::ProvingKey;
    using InnerVK = InnerFlavor::VerificationKey;

    using Transcript = InnerFlavor::Transcript;

    using RecursiveVerifier = ECCVMRecursiveVerifier_<RecursiveFlavor>;

    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsMegaBuilder<OuterBuilder>, MegaFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    static void SetUpTestSuite()
    {
        srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
        bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
    }

    /**
     * @brief Adds operations in BN254 to the op_queue and then constructs and ECCVM circuit from the op_queue.
     *
     * @param engine
     * @return ECCVMCircuitBuilder
     */
    static InnerBuilder generate_circuit(numeric::RNG* engine = nullptr, const size_t num_iterations = 1)
    {
        using Curve = curve::BN254;
        using G1 = Curve::Element;
        using Fr = Curve::ScalarField;

        std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
        G1 a = G1::random_element(engine);
        G1 b = G1::random_element(engine);
        G1 c = G1::random_element(engine);
        Fr x = Fr::random_element(engine);
        Fr y = Fr::random_element(engine);
        for (size_t idx = 0; idx < num_iterations; idx++) {
            op_queue->add_accumulate(a);
            op_queue->mul_accumulate(a, x);
            op_queue->mul_accumulate(b, x);
            op_queue->mul_accumulate(b, y);
            op_queue->add_accumulate(a);
            op_queue->mul_accumulate(b, x);
            op_queue->eq_and_reset();
            op_queue->add_accumulate(c);
            op_queue->mul_accumulate(a, x);
            op_queue->mul_accumulate(b, x);
            op_queue->eq_and_reset();
            op_queue->mul_accumulate(a, x);
            op_queue->mul_accumulate(b, x);
            op_queue->mul_accumulate(c, x);
        }
        InnerBuilder builder{ op_queue };
        return builder;
    }

    static void test_recursive_verification()
    {
        InnerBuilder builder = generate_circuit(&engine);
        InnerProver prover(builder);
        ECCVMProof proof = prover.construct_proof();
        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(prover.key);

        info("ECCVM Recursive Verifier");
        OuterBuilder outer_circuit;
        RecursiveVerifier verifier{ &outer_circuit, verification_key };
        auto [opening_claim, ipa_transcript] = verifier.verify_proof(proof);

        info("Recursive Verifier: num gates = ", outer_circuit.get_estimated_num_finalized_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        InnerVerifier native_verifier(prover.key);
        [[maybe_unused]]bool native_result = native_verifier.verify_proof(proof);

        outer_circuit.finalize_circuit(false);
        auto graph = cdg::Graph(outer_circuit);
        auto connected_components = graph.find_connected_components();
        EXPECT_EQ(connected_components.size(), 1);
        auto variables_in_one_gate = graph.show_variables_in_one_gate(outer_circuit);
        EXPECT_EQ(variables_in_one_gate.size(), 0);
        for (const auto& elem: variables_in_one_gate) {
            info("elem == ", elem);
        } 
    }
};
using FlavorTypes = testing::Types<ECCVMRecursiveFlavor_<UltraCircuitBuilder>>;

TYPED_TEST_SUITE(ECCVMRecursiveTests, FlavorTypes);

TYPED_TEST(ECCVMRecursiveTests, SingleRecursiveVerification)
{
    TestFixture::test_recursive_verification();
};

}