#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/ultra_recursive.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/merge_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {

/**
 * @brief Test suite for recursive verification of conventional Ultra Honk proofs
 * @details The recursive verification circuit is arithmetized in two different ways: 1) using the conventional Ultra
 * arithmetization (UltraCircuitBuilder), or 2) a Goblin-style Ultra arithmetization (GoblinUltraCircuitBuilder).
 *
 * @tparam Builder
 */
template <typename BuilderType> class RecursiveMergeVerifierTest : public testing::Test {

    // Define types relevant for testing
    using UltraFlavor = ::proof_system::honk::flavor::Ultra;
    using GoblinUltraFlavor = ::proof_system::honk::flavor::GoblinUltra;
    using UltraComposer = ::proof_system::honk::UltraComposer_<UltraFlavor>;
    using GoblinUltraComposer = ::proof_system::honk::UltraComposer_<GoblinUltraFlavor>;

    using InnerFlavor = GoblinUltraFlavor;
    using InnerComposer = GoblinUltraComposer;
    using InnerBuilder = typename InnerComposer::CircuitBuilder;
    using InnerCurve = bn254<InnerBuilder>;
    using Commitment = InnerFlavor::Commitment;
    using FF = InnerFlavor::FF;

    // Types for recursive verifier circuit
    using RecursiveFlavor = ::proof_system::honk::flavor::UltraRecursive_<BuilderType>;
    using RecursiveMergeVerifier = MergeRecursiveVerifier_<RecursiveFlavor>;
    using OuterBuilder = BuilderType;

    // Helper for getting composer for prover/verifier of recursive (outer) circuit
    template <typename BuilderT> static auto get_outer_composer()
    {
        if constexpr (IsGoblinBuilder<BuilderT>) {
            return GoblinUltraComposer();
        } else {
            return UltraComposer();
        }
    }

    /**
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    static proof_system::GoblinUltraCircuitBuilder generate_sample_circuit(const std::shared_ptr<ECCOpQueue>& op_queue)
    {
        // Create an arbitrary inner circuit
        InnerBuilder builder{ op_queue };

        // Add some arbitrary ecc op gates
        for (size_t i = 0; i < 3; ++i) {
            auto point = Commitment::random_element();
            auto scalar = FF::random_element();
            builder.queue_ecc_add_accum(point);
            builder.queue_ecc_mul_accum(point, scalar);
        }
        // queues the result of the preceding ECC
        builder.queue_ecc_eq(); // should be eq and reset

        // Add some conventional gates that utilize public inputs
        for (size_t i = 0; i < 10; ++i) {
            FF a = FF::random_element();
            FF b = FF::random_element();
            FF c = FF::random_element();
            FF d = a + b + c;
            uint32_t a_idx = builder.add_public_variable(a);
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
        }

        return builder;
    }

  public:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }

    static void test_sample_circuit_merge()
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        // Populate op queue with mock initial data since we don't handle the empty previous aggregate transcript case
        op_queue->populate_with_mock_initital_data();

        // Create an arbitrary inner circuit with goblin ECC op gates
        InnerBuilder sample_circuit = generate_sample_circuit(op_queue);

        // Generate a merge proof for the inner circuit
        InnerComposer composer;

        // Construct and natively verify the merge proof
        auto merge_prover = composer.create_merge_prover(op_queue);
        auto merge_verifier = composer.create_merge_verifier(0);
        auto merge_proof = merge_prover.construct_proof();
        bool verified = merge_verifier.verify_proof(merge_proof);
        EXPECT_TRUE(verified);
    }

    /**
     * @brief
     *
     */
    static void test_recursive_merge_verification()
    {
        auto op_queue = std::make_shared<ECCOpQueue>();
        op_queue->populate_with_mock_initital_data();

        // Create an arbitrary inner circuit
        InnerBuilder inner_circuit = generate_sample_circuit(op_queue);

        // // Generate a proof over the inner circuit
        // InnerComposer inner_composer;
        // auto instance = inner_composer.create_instance(inner_circuit);
        // auto inner_prover = inner_composer.create_prover(instance);
        // auto inner_proof = inner_prover.construct_proof();

        // Create a recursive verification circuit for the proof of the inner circuit
        OuterBuilder outer_circuit;
        RecursiveMergeVerifier verifier{ &outer_circuit };
        // auto pairing_points = verifier.verify_proof(inner_proof);

        // // Check for a failure flag in the recursive verifier circuit
        // EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        // // Check 1: Perform native verification then perform the pairing on the outputs of the recursive
        // // verifier and check that the result agrees.
        // auto native_verifier = inner_composer.create_verifier(instance);
        // auto native_result = native_verifier.verify_proof(inner_proof);
        // auto recursive_result = native_verifier.pcs_verification_key->pairing_check(pairing_points[0].get_value(),
        //                                                                             pairing_points[1].get_value());
        // EXPECT_EQ(recursive_result, native_result);

        // // Check 2: Ensure that the underlying native and recursive verification algorithms agree by ensuring
        // // the manifests produced by each agree.
        // auto recursive_manifest = verifier.transcript->get_manifest();
        // auto native_manifest = native_verifier.transcript->get_manifest();
        // for (size_t i = 0; i < recursive_manifest.size(); ++i) {
        //     EXPECT_EQ(recursive_manifest[i], native_manifest[i]);
        // }

        // // Check 3: Construct and verify a proof of the recursive verifier circuit
        // {
        //     auto composer = get_outer_composer<OuterBuilder>();
        //     auto instance = composer.create_instance(outer_circuit);
        //     auto prover = composer.create_prover(instance);
        //     auto verifier = composer.create_verifier(instance);
        //     auto proof = prover.construct_proof();
        //     bool verified = verifier.verify_proof(proof);

        //     ASSERT(verified);
        // }
    }
};

// Run the recursive verifier tests with conventional Ultra builder and Goblin builder
using BuilderTypes = testing::Types<UltraCircuitBuilder, GoblinUltraCircuitBuilder>;

TYPED_TEST_SUITE(RecursiveMergeVerifierTest, BuilderTypes);

HEAVY_TYPED_TEST(RecursiveMergeVerifierTest, NativeSampleCircuitMerge)
{
    TestFixture::test_sample_circuit_merge();
};

HEAVY_TYPED_TEST(RecursiveMergeVerifierTest, SingleRecursiveVerification)
{
    TestFixture::test_recursive_merge_verification();
};

} // namespace proof_system::plonk::stdlib::recursion::honk