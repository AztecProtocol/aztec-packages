#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

// Helper traits to extract Builder type from Curve
template <typename Curve, typename = void> struct BuilderTypeHelper {
    struct DummyBuilder {};
    using type = DummyBuilder;
};

template <typename Curve> struct BuilderTypeHelper<Curve, std::enable_if_t<Curve::is_stdlib_type>> {
    using type = typename Curve::Builder;
};

/**
 * @brief Unified test fixture for native and recursive merge verification
 * @details Templates on Curve type to handle both native (curve::BN254) and recursive (bn254<Builder>) contexts
 * @tparam Curve The curve type (native or stdlib)
 */
template <typename Curve> class MergeUnifiedTest : public testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using MergeVerifierType = MergeVerifier_<Curve>;
    using Transcript = typename MergeVerifierType::Transcript;
    using PairingPoints = typename MergeVerifierType::PairingPoints;
    using TableCommitments = typename MergeVerifierType::TableCommitments;
    using InputCommitments = typename MergeVerifierType::InputCommitments;
    using Proof = typename MergeVerifierType::Proof;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<curve::BN254>;

    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

    // Builder type is only available in recursive context
    using BuilderType = typename BuilderTypeHelper<Curve>::type;

    enum class TamperProofMode : uint8_t { None, Shift, MCommitment, LEval };

    /**
     * @brief Convert a stdlib type to its native value
     * @details In native context, returns value as-is; in recursive context, extracts the native value
     */
    template <typename T> static auto to_native(const T& val)
    {
        if constexpr (IsRecursive) {
            return val.get_value();
        } else {
            return val;
        }
    }

    /**
     * @brief Create a commitment from a native commitment value
     * @details In native context, returns commitment as-is; in recursive context, creates witness commitment
     */
    static Commitment create_commitment(BuilderType& builder, const curve::BN254::AffineElement& native_commitment)
    {
        if constexpr (IsRecursive) {
            auto commitment = Commitment::from_witness(&builder, native_commitment);
            commitment.unset_free_witness_tag();
            return commitment;
        } else {
            (void)builder; // Unused in native context
            return native_commitment;
        }
    }

    /**
     * @brief Create a proof object from a vector of field elements
     * @details In native context, returns vector as-is; in recursive context, creates stdlib::Proof which is then
     * converted to std::vector<FF>
     */
    static Proof create_proof(BuilderType& builder, const std::vector<bb::fr>& native_proof)
    {
        if constexpr (IsRecursive) {
            // Create stdlib::Proof, which is std::vector<stdlib::field_t<Builder>>
            stdlib::Proof<BuilderType> stdlib_proof(builder, native_proof);
            // It's already the right type (std::vector<FF>), just return it
            return stdlib_proof;
        } else {
            (void)builder; // Unused in native context
            return native_proof;
        }
    }

    /**
     * @brief Check circuit validity (only relevant in recursive context)
     */
    static bool check_circuit(BuilderType& builder)
    {
        if constexpr (IsRecursive) {
            return !builder.failed();
        } else {
            (void)builder; // Unused in native context
            return true;
        }
    }

    /**
     * @brief Tamper with the merge proof for negative testing
     */
    static void tamper_with_proof(std::vector<bb::fr>& merge_proof, const TamperProofMode tampering_mode)
    {
        const size_t shift_idx = 0;        // Index of shift_size in the merge proof
        const size_t m_commitment_idx = 1; // Index of first commitment to merged table in merge proof
        const size_t l_eval_idx = 22;      // Index of first evaluation of l(1/kappa) in merge proof

        switch (tampering_mode) {
        case TamperProofMode::Shift:
            // Tamper with the shift size in the proof
            merge_proof[shift_idx] += bb::fr(1);
            break;
        case TamperProofMode::MCommitment: {
            // Tamper with the commitment in the proof
            auto m_commitment =
                FrCodec::deserialize_from_fields<curve::BN254::AffineElement>(std::span{ merge_proof }.subspan(
                    m_commitment_idx, FrCodec::calc_num_fields<curve::BN254::AffineElement>()));
            m_commitment = m_commitment + curve::BN254::AffineElement::one();
            auto m_commitment_frs = FrCodec::serialize_to_fields<curve::BN254::AffineElement>(m_commitment);
            for (size_t idx = 0; idx < 4; ++idx) {
                merge_proof[m_commitment_idx + idx] = m_commitment_frs[idx];
            }
            break;
        }
        case TamperProofMode::LEval:
            // Tamper with the evaluation in the proof
            merge_proof[l_eval_idx] -= bb::fr(1);
            break;
        default:
            // Nothing to do
            break;
        }
    }

    /**
     * @brief Prove and verify a merge proof in both native and recursive contexts
     * @details Creates a merge proof, optionally tampers with it, then verifies in the appropriate context
     */
    static void prove_and_verify_merge(const std::shared_ptr<ECCOpQueue>& op_queue,
                                       const MergeSettings settings = MergeSettings::PREPEND,
                                       const TamperProofMode tampering_mode = TamperProofMode::None,
                                       const bool expected = true)
    {
        // Create native merge proof
        MergeProver merge_prover{ op_queue, settings };
        auto native_proof = merge_prover.construct_proof();
        tamper_with_proof(native_proof, tampering_mode);

        // Create commitments to subtables
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_previous_ultra_ops_table_columns();

        // Native commitments
        std::array<curve::BN254::AffineElement, NUM_WIRES> native_t_commitments;
        std::array<curve::BN254::AffineElement, NUM_WIRES> native_T_prev_commitments;
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            native_t_commitments[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
            native_T_prev_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_prev[idx]);
        }

        // Create builder (only used in recursive context)
        BuilderType builder;

        // Create commitments and proof in the appropriate context
        InputCommitments input_commitments;
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            input_commitments.t_commitments[idx] = create_commitment(builder, native_t_commitments[idx]);
            input_commitments.T_prev_commitments[idx] = create_commitment(builder, native_T_prev_commitments[idx]);
        }
        Proof proof = create_proof(builder, native_proof);

        // Verify the proof
        auto transcript = std::make_shared<Transcript>();
        if constexpr (IsRecursive) {
            transcript->enable_manifest();
        }
        MergeVerifierType verifier{ settings, transcript };
        auto [pairing_points, merged_table_commitments, degree_check_passed, concatenation_check_passed] =
            verifier.verify_proof(proof, input_commitments);

        // Perform pairing check and verify
        VerifierCommitmentKey pcs_verification_key;
        bool pairing_verified =
            pcs_verification_key.pairing_check(to_native(pairing_points.P0), to_native(pairing_points.P1));
        bool verified = pairing_verified && degree_check_passed && concatenation_check_passed;
        EXPECT_EQ(verified, expected);

        // Check circuit validity (only relevant in recursive context)
        if constexpr (IsRecursive) {
            bool circuit_valid = check_circuit(builder);
            EXPECT_EQ(circuit_valid, expected);
        }

        // For recursive context, compare manifests with native verification
        if constexpr (IsRecursive) {
            auto native_transcript = std::make_shared<NativeTranscript>();
            native_transcript->enable_manifest();
            MergeVerifier native_verifier{ settings, native_transcript };

            // Native input commitments
            MergeVerifier::InputCommitments native_input_commitments;
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                native_input_commitments.t_commitments[idx] = native_t_commitments[idx];
                native_input_commitments.T_prev_commitments[idx] = native_T_prev_commitments[idx];
            }

            auto [native_pairing_points, _, native_degree_check, native_concatenation_check] =
                native_verifier.verify_proof(native_proof, native_input_commitments);

            // Ensure native and recursive verification agree
            bool verified_native = native_pairing_points.check() && native_degree_check && native_concatenation_check;
            EXPECT_EQ(verified_native, verified);

            // Check that manifests agree
            auto recursive_manifest = transcript->get_manifest();
            auto native_manifest = native_transcript->get_manifest();
            EXPECT_EQ(recursive_manifest.size(), native_manifest.size());
            for (size_t i = 0; i < recursive_manifest.size(); ++i) {
                EXPECT_EQ(recursive_manifest[i], native_manifest[i]);
            }
        }
    }

    /**
     * @brief Test that merge proof size matches the expected constant
     * @details Useful for ensuring correct construction of mock merge proofs
     */
    static void test_merge_proof_size()
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        InnerBuilder builder;
        GoblinMockCircuits::construct_simple_circuit(builder);

        // Construct a merge proof and ensure its size matches expectation
        MergeProver merge_prover{ builder.op_queue };
        auto merge_proof = merge_prover.construct_proof();

        EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
    }

    /**
     * @brief Test basic merge proof construction and verification
     */
    static void test_single_merge()
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        prove_and_verify_merge(op_queue);
    }

    /**
     * @brief Test multiple merge proofs with prepend mode
     */
    static void test_multiple_merges_prepend()
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();

        // First circuit
        InnerBuilder circuit1{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit1);
        prove_and_verify_merge(op_queue);

        // Second circuit
        InnerBuilder circuit2{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit2);
        prove_and_verify_merge(op_queue);

        // Third circuit
        InnerBuilder circuit3{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit3);
        prove_and_verify_merge(op_queue);
    }

    /**
     * @brief Test merge proof with append mode
     */
    static void test_merge_prepend_then_append()
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();

        // First circuit with prepend
        InnerBuilder circuit1{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit1);
        prove_and_verify_merge(op_queue);

        // Second circuit with prepend
        InnerBuilder circuit2{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit2);
        prove_and_verify_merge(op_queue);

        // Third circuit with append
        InnerBuilder circuit3{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit3);
        prove_and_verify_merge(op_queue, MergeSettings::APPEND);
    }

    /**
     * @brief Test failure when degree(l) > shift_size (as read from the proof)
     */
    static void test_degree_check_failure()
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        prove_and_verify_merge(op_queue, MergeSettings::PREPEND, TamperProofMode::Shift, false);
    }

    /**
     * @brief Test failure when m ≠ l + X^k r
     */
    static void test_merge_failure()
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        prove_and_verify_merge(op_queue, MergeSettings::PREPEND, TamperProofMode::MCommitment, false);
    }

    /**
     * @brief Test failure when g_j(kappa) ≠ kappa^{k-1} * l_j(1/kappa)
     */
    static void test_eval_failure()
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        prove_and_verify_merge(op_queue, MergeSettings::PREPEND, TamperProofMode::LEval, false);
    }
};

// Define test types: native and recursive contexts
using CurveTypes = ::testing::Types<curve::BN254,                        // Native
                                    stdlib::bn254<MegaCircuitBuilder>,   // Recursive (Mega)
                                    stdlib::bn254<UltraCircuitBuilder>>; // Recursive (Ultra)

TYPED_TEST_SUITE(MergeUnifiedTest, CurveTypes);

TYPED_TEST(MergeUnifiedTest, MergeProofSizeCheck)
{
    TestFixture::test_merge_proof_size();
}

TYPED_TEST(MergeUnifiedTest, SingleMerge)
{
    TestFixture::test_single_merge();
}

TYPED_TEST(MergeUnifiedTest, MultipleMergesPrepend)
{
    TestFixture::test_multiple_merges_prepend();
}

TYPED_TEST(MergeUnifiedTest, MergePrependThenAppend)
{
    TestFixture::test_merge_prepend_then_append();
}

TYPED_TEST(MergeUnifiedTest, DegreeCheckFailure)
{
    TestFixture::test_degree_check_failure();
}

TYPED_TEST(MergeUnifiedTest, MergeFailure)
{
    TestFixture::test_merge_failure();
}

TYPED_TEST(MergeUnifiedTest, EvalFailure)
{
    TestFixture::test_eval_failure();
}

} // namespace bb
