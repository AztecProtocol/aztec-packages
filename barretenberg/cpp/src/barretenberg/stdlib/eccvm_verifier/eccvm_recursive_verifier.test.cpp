#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
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
    static InnerBuilder generate_circuit(numeric::RNG* engine = nullptr)
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
        InnerBuilder builder{ op_queue };
        return builder;
    }
    static InnerBuilder generate_circuit_diff_size(numeric::RNG* engine = nullptr)
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

        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(a, x);
        // op_queue->mul_accumulate(b, x);
        op_queue->mul_accumulate(b, y);
        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(b, x);
        op_queue->eq_and_reset();
        op_queue->add_accumulate(c);
        op_queue->mul_accumulate(a, x);

        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->eq_and_reset();
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->mul_accumulate(c, x);
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

        bool result = CircuitChecker::check(outer_circuit);
        EXPECT_TRUE(result);

        InnerVerifier native_verifier(prover.key);
        bool native_result = native_verifier.verify_proof(proof);
        EXPECT_TRUE(native_result);
        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        // Ensure verification key is the same
        EXPECT_EQ(verifier.key->circuit_size, verification_key->circuit_size);
        EXPECT_EQ(verifier.key->log_circuit_size, verification_key->log_circuit_size);
        EXPECT_EQ(verifier.key->num_public_inputs, verification_key->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] : zip_view(verifier.key->get_all(), verification_key->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        // Construct a full proof from the recursive verifier circuit
        {
            auto proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            OuterProver prover(proving_key);
            auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->proving_key);
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    }
    static void test_recursive_verification2()
    {
        InnerBuilder builder = generate_circuit_diff_size(&engine);
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

        bool result = CircuitChecker::check(outer_circuit);
        EXPECT_TRUE(result);

        InnerVerifier native_verifier(prover.key);
        bool native_result = native_verifier.verify_proof(proof);
        EXPECT_TRUE(native_result);
        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        // Ensure verification key is the same
        EXPECT_EQ(verifier.key->circuit_size, verification_key->circuit_size);
        EXPECT_EQ(verifier.key->log_circuit_size, verification_key->log_circuit_size);
        EXPECT_EQ(verifier.key->num_public_inputs, verification_key->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] : zip_view(verifier.key->get_all(), verification_key->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        // Construct a full proof from the recursive verifier circuit
        {
            auto proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            OuterProver prover(proving_key);
            auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->proving_key);
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    }

    static void test_recursive_verification_failure()
    {
        InnerBuilder builder = generate_circuit(&engine);
        builder.op_queue->add_erroneous_equality_op_for_testing();
        InnerProver prover(builder);
        ECCVMProof proof = prover.construct_proof();
        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(prover.key);

        OuterBuilder outer_circuit;
        RecursiveVerifier verifier{ &outer_circuit, verification_key };
        verifier.verify_proof(proof);
        info("Recursive Verifier: estimated num finalized gates = ", outer_circuit.get_estimated_num_finalized_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_FALSE(CircuitChecker::check(outer_circuit));
    }
};
using FlavorTypes = testing::Types<ECCVMRecursiveFlavor_<UltraCircuitBuilder>>;

TYPED_TEST_SUITE(ECCVMRecursiveTests, FlavorTypes);

TYPED_TEST(ECCVMRecursiveTests, SingleRecursiveVerification)
{
    TestFixture::test_recursive_verification();
};

TYPED_TEST(ECCVMRecursiveTests, SingleRecursiveVerificationSize2)
{
    TestFixture::test_recursive_verification2();
};
TYPED_TEST(ECCVMRecursiveTests, SingleRecursiveVerificationFailure)
{
    TestFixture::test_recursive_verification_failure();
};
} // namespace bb