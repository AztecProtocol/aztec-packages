#include "barretenberg/ultra_honk/merge_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/merge_verifier/merge_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/ultra_honk/merge_prover.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::goblin {

/**
 * @brief Test suite for recursive verification of Goblin Merge proofs
 * @details The recursive verification circuit is arithmetized using Goblin-style Ultra arithmetization
 * (MegaCircuitBuilder).
 *
 * @tparam Builder
 */
template <class RecursiveBuilder> class RecursiveMergeVerifierTest : public testing::Test {

    // Types for recursive verifier circuit
    using RecursiveMergeVerifier = MergeRecursiveVerifier_<RecursiveBuilder>;
    using RecursiveTranscript = MegaRecursiveFlavor_<RecursiveBuilder>::Transcript;

    // Define types relevant for inner circuit
    using InnerFlavor = MegaFlavor;
    using InnerDeciderProvingKey = DeciderProvingKey_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using Transcript = InnerFlavor::Transcript;

    // Define additional types for testing purposes
    using Commitment = InnerFlavor::Commitment;
    using FF = InnerFlavor::FF;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<curve::BN254>;

  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    class TestData {
      public:
        size_t degree_proof_idx = 0;
        size_t T_commitment_idx = 17;
        size_t t_eval_kappa_inv_idx = 51;
        // Outer verification circuit
        RecursiveBuilder outer_circuit;
        // Merge proof
        std::vector<FF> merge_proof;
        // Subtable values and commitments
        std::array<Commitment, InnerFlavor::NUM_WIRES> t_commitments_val;
        std::array<typename RecursiveMergeVerifier::Commitment, InnerFlavor::NUM_WIRES> t_commitments_rec_val;
        RefArray<typename RecursiveMergeVerifier::Commitment, InnerFlavor::NUM_WIRES> t_commitments_rec;
        RefArray<Commitment, InnerFlavor::NUM_WIRES> t_commitments;

        /**
         * @brief Change the subtable degree sent by the prover
         *
         */
        void tamper_with_degree() { this->merge_proof[degree_proof_idx] -= 1; }

        /**
         * @brief Change the T_commitment sent by the prover
         *
         */
        void tamper_with_T_commitment()
        {
            Commitment T_commitment = bb::field_conversion::convert_from_bn254_frs<Commitment>(
                std::span{ this->merge_proof }.subspan(T_commitment_idx, 4));
            T_commitment = T_commitment + Commitment::one();
            auto T_commitment_frs = bb::field_conversion::convert_to_bn254_frs<Commitment>(T_commitment);
            for (size_t idx = 0; idx < 4; ++idx) {
                this->merge_proof[T_commitment_idx + idx] = T_commitment_frs[idx];
            }
        }

        /**
         * @brief Change the t_eval_kappa_inv sent by the prover
         *
         */
        void tamper_with_t_eval_kappa_inv() { this->merge_proof[t_eval_kappa_inv_idx] -= FF(1); }
    };

    /**
     * @brief Generate test data
     *
     */
    static TestData generate_test_data()
    {
        TestData setup;

        auto op_queue = std::make_shared<ECCOpQueue>();

        InnerBuilder sample_circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(sample_circuit);

        RecursiveBuilder outer_circuit;
        setup.outer_circuit = outer_circuit;

        MergeProver merge_prover{ op_queue };
        setup.merge_proof = merge_prover.construct_proof();

        // Subtable values and commitments
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        for (size_t idx = 0; idx < InnerFlavor::NUM_WIRES; idx++) {
            setup.t_commitments_val[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
            setup.t_commitments_rec_val[idx] =
                RecursiveMergeVerifier::Commitment::from_witness(&setup.outer_circuit, setup.t_commitments_val[idx]);
        }

        RefArray<Commitment, InnerFlavor::NUM_WIRES> t_commitments(setup.t_commitments_val);
        RefArray<typename RecursiveMergeVerifier::Commitment, InnerFlavor::NUM_WIRES> t_commitments_rec(
            setup.t_commitments_rec_val);
        setup.t_commitments = t_commitments;
        setup.t_commitments_rec = t_commitments_rec;

        return setup;
    }

    /**
     * @brief Perform native verification
     *
     */
    static std::pair<bool, std::shared_ptr<Transcript>> native_verification(const TestData& setup)
    {
        MergeVerifier verifier;
        verifier.transcript->enable_manifest();
        return std::make_pair(verifier.verify_proof(setup.merge_proof, setup.t_commitments), verifier.transcript);
    }

    /**
     * @brief Perform recursive verification
     *
     */
    static std::pair<bool, std::shared_ptr<RecursiveTranscript>> recursive_verification(
        TestData& setup, bool circuit_builder_flag = false)
    {
        // Create a recursive merge verification circuit for the merge proof
        RecursiveMergeVerifier verifier{ &setup.outer_circuit };
        verifier.transcript->enable_manifest();
        const stdlib::Proof<RecursiveBuilder> stdlib_merge_proof(setup.outer_circuit, setup.merge_proof);
        auto pairing_points = verifier.verify_proof(stdlib_merge_proof, setup.t_commitments_rec);

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(setup.outer_circuit.failed(), circuit_builder_flag) << setup.outer_circuit.err();

        // Check the recursive merge verifier circuit
        CircuitChecker::check(setup.outer_circuit);

        VerifierCommitmentKey pcs_verification_key;
        return std::make_pair(
            pcs_verification_key.pairing_check(pairing_points.P0.get_value(), pairing_points.P1.get_value()),
            verifier.transcript);
    }

    /**
     * @brief Test recursive merge verification for the ops generated by a sample circuit
     * @details We construct and verify an Ultra Honk proof of the recursive merge verifier circuit to check its
     * correctness rather than calling check_circuit since this functionality is incomplete for the Goblin
     * arithmetization
     */
    static void test_recursive_merge_verification()
    {
        TestData setup = generate_test_data();

        // Check 1: Perform native merge verification then perform the pairing on the outputs of the recursive merge
        // verifier and check that both succeed.
        auto [native_verified, native_transcript] = native_verification(setup);
        auto [recursive_verified, recursive_transcript] = recursive_verification(setup);
        EXPECT_TRUE(native_verified);
        EXPECT_TRUE(recursive_verified);

        // Check 2: Ensure that the underlying native and recursive merge verification algorithms agree by ensuring
        // the manifests produced by each agree.
        auto recursive_manifest = native_transcript->get_manifest();
        auto native_manifest = recursive_transcript->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i]);
        }
    }

    /**
     * @brief Test failure when degree(subtable) > subtable_size (as read from the proof)
     */
    static void test_degree_check_failure()
    {
        TestData setup = generate_test_data();
        // Decrease subtable_size in the proof by 1
        setup.tamper_with_degree();

        // Perform native merge verification then perform the pairing on the outputs of the recursive merge
        // verifier and check that both fail.
        auto [native_verified, native_transcript] = native_verification(setup);
        auto [recursive_verified, recursive_transcript] = recursive_verification(setup, /*circuit_builder_flag=*/true);
        EXPECT_FALSE(native_verified);
        EXPECT_FALSE(recursive_verified);
    }

    /**
     * @brief Test failure when T \neq t + X^l T_prev
     */
    static void test_merge_failure()
    {
        TestData setup = generate_test_data();
        setup.tamper_with_T_commitment();

        // Perform native merge verification then perform the pairing on the outputs of the recursive merge
        // verifier and check that both fail.
        auto [native_verified, native_transcript] = native_verification(setup);
        auto [recursive_verified, recursive_transcript] = recursive_verification(setup, /*circuit_builder_flag=*/true);
        EXPECT_FALSE(native_verified);
        EXPECT_FALSE(recursive_verified);
    }

    /**
     * @brief Test failure g_j(kappa) = kappa^{l-1} * t_j(1/kappa)
     */
    static void test_eval_failure()
    {
        TestData setup = generate_test_data();
        setup.tamper_with_t_eval_kappa_inv();

        // Perform native merge verification then perform the pairing on the outputs of the recursive merge
        // verifier and check that both fail.
        auto [native_verified, native_transcript] = native_verification(setup);
        auto [recursive_verified, recursive_transcript] = recursive_verification(setup, /*circuit_builder_flag=*/true);
        EXPECT_FALSE(native_verified);
        EXPECT_FALSE(recursive_verified);
    }
};

using Builders = testing::Types<MegaCircuitBuilder, UltraCircuitBuilder>;

TYPED_TEST_SUITE(RecursiveMergeVerifierTest, Builders);

TYPED_TEST(RecursiveMergeVerifierTest, SingleRecursiveVerification)
{
    TestFixture::test_recursive_merge_verification();
};

TYPED_TEST(RecursiveMergeVerifierTest, DegreeCheckFailure)
{
    TestFixture::test_degree_check_failure();
};

TYPED_TEST(RecursiveMergeVerifierTest, TcommitmentFailure)
{
    TestFixture::test_merge_failure();
};

TYPED_TEST(RecursiveMergeVerifierTest, TevalFailure)
{
    TestFixture::test_eval_failure();
};

} // namespace bb::stdlib::recursion::goblin
