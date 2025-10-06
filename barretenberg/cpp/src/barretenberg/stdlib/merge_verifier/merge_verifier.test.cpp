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
    using RecursiveTableCommitments = MergeRecursiveVerifier_<RecursiveBuilder>::TableCommitments;
    using RecursiveMergeCommitments = MergeRecursiveVerifier_<RecursiveBuilder>::InputCommitments;

    // Define types relevant for inner circuit
    using InnerFlavor = MegaFlavor;
    using InnerProverInstance = ProverInstance_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;

    // Define additional types for testing purposes
    using Commitment = InnerFlavor::Commitment;
    using FF = InnerFlavor::FF;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<curve::BN254>;
    using MergeProof = MergeProver::MergeProof;
    using TableCommitments = MergeVerifier::TableCommitments;
    using MergeCommitments = MergeVerifier::InputCommitments;

    enum class TamperProofMode { None, Shift, MCommitment, LEval };

  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static void tamper_with_proof(MergeProof& merge_proof, const TamperProofMode tampering_mode)
    {
        const size_t shift_idx = 0;        // Index of shift_size in the merge proof
        const size_t m_commitment_idx = 1; // Index of first commitment to merged table in merge proof
        const size_t l_eval_idx = 34;      // Index of first evaluation of l(1/kappa) in merge proof

        switch (tampering_mode) {
        case TamperProofMode::Shift:
            // Tamper with the shift size in the proof
            merge_proof[shift_idx] += 1;
            break;
        case TamperProofMode::MCommitment: {
            // Tamper with the commitment in the proof
            Commitment m_commitment =
                bb::field_conversion::convert_from_bn254_frs<Commitment>(std::span{ merge_proof }.subspan(
                    m_commitment_idx, bb::field_conversion::calc_num_bn254_frs<Commitment>()));
            m_commitment = m_commitment + Commitment::one();
            auto m_commitment_frs = bb::field_conversion::convert_to_bn254_frs<Commitment>(m_commitment);
            for (size_t idx = 0; idx < 4; ++idx) {
                merge_proof[m_commitment_idx + idx] = m_commitment_frs[idx];
            }
            break;
        }
        case TamperProofMode::LEval:
            // Tamper with the evaluation in the proof
            merge_proof[l_eval_idx] -= FF(1);
            break;
        default:
            // Nothing to do
            break;
        }
    }

    static void prove_and_verify_merge(const std::shared_ptr<ECCOpQueue>& op_queue,
                                       const MergeSettings settings = MergeSettings::PREPEND,
                                       const TamperProofMode tampering_mode = TamperProofMode::None,
                                       const bool expected = true)
    {
        RecursiveBuilder outer_circuit;

        MergeProver merge_prover{ op_queue, settings };
        auto merge_proof = merge_prover.construct_proof();
        tamper_with_proof(merge_proof, tampering_mode);

        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        MergeCommitments merge_commitments;
        RecursiveMergeCommitments recursive_merge_commitments;
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_previous_ultra_ops_table_columns();
        for (size_t idx = 0; idx < InnerFlavor::NUM_WIRES; idx++) {
            merge_commitments.t_commitments[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
            merge_commitments.T_prev_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_prev[idx]);
            recursive_merge_commitments.t_commitments[idx] =
                RecursiveMergeVerifier::Commitment::from_witness(&outer_circuit, merge_commitments.t_commitments[idx]);
            recursive_merge_commitments.T_prev_commitments[idx] = RecursiveMergeVerifier::Commitment::from_witness(
                &outer_circuit, merge_commitments.T_prev_commitments[idx]);
            // Removing the free witness tag, since the merge commitments in the full scheme are supposed to
            // be fiat-shamirred earlier
            recursive_merge_commitments.t_commitments[idx].unset_free_witness_tag();
            recursive_merge_commitments.T_prev_commitments[idx].unset_free_witness_tag();
        }

        // Create a recursive merge verification circuit for the merge proof
        RecursiveMergeVerifier verifier{ &outer_circuit, settings };
        verifier.transcript->enable_manifest();
        const stdlib::Proof<RecursiveBuilder> stdlib_merge_proof(outer_circuit, merge_proof);
        auto [pairing_points, recursive_merged_table_commitments] =
            verifier.verify_proof(stdlib_merge_proof, recursive_merge_commitments);

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), !expected) << outer_circuit.err();

        // Check 1: Perform native merge verification then perform the pairing on the outputs of the recursive merge
        // verifier and check that the result agrees.
        MergeVerifier native_verifier{ settings };
        native_verifier.transcript->enable_manifest();
        auto [verified_native, merged_table_commitments] = native_verifier.verify_proof(merge_proof, merge_commitments);
        VerifierCommitmentKey pcs_verification_key;
        bool verified_recursive =
            pcs_verification_key.pairing_check(pairing_points.P0.get_value(), pairing_points.P1.get_value());
        EXPECT_EQ(verified_native, verified_recursive);
        EXPECT_EQ(verified_recursive, expected);

        // Check 2: Ensure that the underlying native and recursive merge verification algorithms agree by ensuring
        // the manifests produced by each agree.
        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i]);
        }
    }

    /**
     * @brief Test failure when degree(l) > shift_size (as read from the proof)
     */
    static void test_degree_check_failure()
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);
        prove_and_verify_merge(op_queue, MergeSettings::PREPEND, TamperProofMode::Shift, false);
    }

    /**
     * @brief Test failure when m \neq l + X^k r
     */
    static void test_merge_failure()
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);
        prove_and_verify_merge(op_queue, MergeSettings::PREPEND, TamperProofMode::MCommitment, false);
    }

    /**
     * @brief Test failure g_j(kappa) = kappa^{k-1} * l_j(1/kappa)
     */
    static void test_eval_failure()
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);
        prove_and_verify_merge(op_queue, MergeSettings::PREPEND, TamperProofMode::LEval, false);
    }

    /**
     * @brief Test recursive merge verification for the ops generated by several sample circuit, both prepended and
     * appended
     * @details We construct and verify an Ultra Honk proof of the recursive merge verifier circuit to check its
     * correctness rather than calling check_circuit since this functionality is incomplete for the Goblin
     * arithmetization
     */
    static void test_recursive_merge_verification()
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);
        prove_and_verify_merge(op_queue);

        InnerBuilder circuit2{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit2);
        prove_and_verify_merge(op_queue);

        InnerBuilder circuit3{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit3);
        prove_and_verify_merge(op_queue, MergeSettings::APPEND);
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

TYPED_TEST(RecursiveMergeVerifierTest, MergeFailure)
{
    TestFixture::test_merge_failure();
};

TYPED_TEST(RecursiveMergeVerifierTest, EvalFailure)
{
    TestFixture::test_eval_failure();
};

} // namespace bb::stdlib::recursion::goblin
