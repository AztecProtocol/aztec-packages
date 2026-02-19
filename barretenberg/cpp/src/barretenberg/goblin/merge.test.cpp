#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
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
template <typename MergeTestParams> class MergeTests : public testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Curve = MergeTestParams::CurveType;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using MergeVerifierType = MergeVerifier_<MergeTestParams::BATCH_SIZE, Curve>;
    using Transcript = typename MergeVerifierType::Transcript;
    using PairingPoints = typename MergeVerifierType::PairingPoints;
    using TableCommitments = typename MergeVerifierType::TableCommitments;
    using InputCommitments = typename MergeVerifierType::InputCommitments;
    using Proof = typename MergeVerifierType::Proof;
    using PolynomialBatch = typename MergeProver<MergeTestParams::BATCH_SIZE>::PolynomialBatch;

    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static constexpr size_t BATCH_SIZE = MergeTestParams::BATCH_SIZE;
    static constexpr size_t NUM_COLUMNS = MergeVerifierType::NUM_COLUMNS;

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
            return CircuitChecker::check(builder);
        } else {
            (void)builder; // Unused in native context
            return true;
        }
    }

    /**
     * @brief Tamper with the merge proof for failure testing
     */
    static void tamper_with_proof(std::vector<bb::fr>& merge_proof, const TamperProofMode tampering_mode)
    {
        constexpr size_t NUM_FRS_COMM = Transcript::Codec::template calc_num_fields<Commitment>();
        const size_t shift_idx = 0;        // Index of shift_size in the merge proof
        const size_t m_commitment_idx = 1; // Index of first commitment to merged table in merge proof
        const size_t l_eval_idx =
            1 + NUM_FRS_COMM * (NUM_COLUMNS + 1); // Index of first evaluation of l(kappa) in merge proof

        switch (tampering_mode) {
        case TamperProofMode::Shift:
            // Tamper with the shift size in the proof
            merge_proof[shift_idx] += bb::fr(1);
            break;
        case TamperProofMode::MCommitment: {
            // Tamper with the commitment in the proof
            auto m_commitment = FrCodec::deserialize_from_fields<curve::BN254::AffineElement>(
                std::span{ merge_proof }.subspan(m_commitment_idx, NUM_FRS_COMM));
            m_commitment = m_commitment + curve::BN254::AffineElement::one();
            auto m_commitment_frs = FrCodec::serialize_to_fields<curve::BN254::AffineElement>(m_commitment);
            for (size_t idx = 0; idx < NUM_FRS_COMM; ++idx) {
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
        auto prover_transcript = std::make_shared<NativeTranscript>();
        MergeProver<BATCH_SIZE> merge_prover{ op_queue, prover_transcript, settings };
        auto native_proof = merge_prover.construct_proof();
        tamper_with_proof(native_proof, tampering_mode);

        // Create commitments to subtables
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_previous_ultra_ops_table_columns();

        PolynomialBatch t_current_batch(t_current);
        PolynomialBatch T_prev_batch(T_prev);

        // Native commitments
        std::array<curve::BN254::AffineElement, NUM_COLUMNS> native_t_commitments;
        std::array<curve::BN254::AffineElement, NUM_COLUMNS> native_T_prev_commitments;
        for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
            native_t_commitments[idx] =
                merge_prover.pcs_commitment_key.template commit_interleaved<BATCH_SIZE>(t_current_batch[idx]);
            native_T_prev_commitments[idx] =
                merge_prover.pcs_commitment_key.template commit_interleaved<BATCH_SIZE>(T_prev_batch[idx]);
        }

        // Compute expected merged table commitments independently
        // After merge, the full table is T_merged = T_prev || t_current (PREPEND) or t_current || T_prev (APPEND)
        auto T_merged = op_queue->construct_ultra_ops_table_columns();
        PolynomialBatch T_merged_batch(T_merged);
        std::array<curve::BN254::AffineElement, NUM_COLUMNS> expected_merged_commitments;
        for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
            expected_merged_commitments[idx] =
                merge_prover.pcs_commitment_key.template commit_interleaved<BATCH_SIZE>(T_merged_batch[idx]);
        }

        // Create builder (only used in recursive context)
        BuilderType builder;

        // Create commitments and proof in the appropriate context
        InputCommitments input_commitments;
        for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
            input_commitments.t_commitments[idx] = create_commitment(builder, native_t_commitments[idx]);
            input_commitments.T_prev_commitments[idx] = create_commitment(builder, native_T_prev_commitments[idx]);
        }
        Proof proof = create_proof(builder, native_proof);

        // Verify the proof
        auto transcript = std::make_shared<Transcript>();
        MergeVerifierType verifier{ settings, transcript };
        auto result = verifier.reduce_to_pairing_check(proof, input_commitments);

        // Perform pairing check and verify
        bool pairing_verified = result.pairing_points.check();
        bool verified = pairing_verified && result.reduction_succeeded;
        EXPECT_EQ(verified, expected);

        // If verification is expected to succeed, also check that the merged table commitments match
        if (expected) {
            for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
                EXPECT_EQ(to_native(result.merged_commitments[idx]), expected_merged_commitments[idx])
                    << "Merged table commitment mismatch at index " << idx;
            }
        }

        // Check circuit validity (only relevant in recursive context)
        if constexpr (IsRecursive) {
            bool circuit_valid = check_circuit(builder);
            EXPECT_EQ(circuit_valid, expected);
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
        auto transcript = std::make_shared<NativeTranscript>();
        MergeProver<BATCH_SIZE> merge_prover{ builder.op_queue, transcript };
        auto merge_proof = merge_prover.construct_proof();

        EXPECT_EQ(merge_proof.size(), MergeProver<BATCH_SIZE>::MERGE_PROOF_SIZE())
            << "Merge proof size does not match expected constant";
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
    static void test_degree_check_failure(const MergeSettings settings = MergeSettings::PREPEND)
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        prove_and_verify_merge(op_queue, settings, TamperProofMode::Shift, false);
    }

    /**
     * @brief Test failure when m ≠ l + X^k r
     */
    static void test_merge_failure(const MergeSettings settings = MergeSettings::PREPEND)
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        prove_and_verify_merge(op_queue, settings, TamperProofMode::MCommitment, false);
    }

    /**
     * @brief Test failure when g_j(kappa) ≠ kappa^{k-1} * l_j(1/kappa)
     */
    static void test_eval_failure(const MergeSettings settings = MergeSettings::PREPEND)
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        prove_and_verify_merge(op_queue, settings, TamperProofMode::LEval, false);
    }

    /**
     * @brief Test the de-interleaving proof after two rounds of merge
     * @details Performs two merge rounds. For the second (last) merge the prover uses a shared
     * transcript: it first runs construct_proof() then construct_de_interleaving_proof() on the
     * same transcript object, producing two incremental proof slices. The verifier uses the same
     * shared transcript, calling reduce_to_pairing_check() with the merge slice and then
     * reduce_de_interleaving_to_pairing_check() with the de-interleaving slice.
     *
     * Verifies:
     *  1. The de-interleaved commitments returned by the verifier match those independently
     *     computed from the op-queue wire polynomials.
     *  2. The pairing points for both the merge and de-interleaving checks are valid.
     *  3. The circuit is satisfied (recursive context only).
     */
    static void test_de_interleaving()
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();

        // First merge round
        InnerBuilder circuit1{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit1);
        prove_and_verify_merge(op_queue);

        // Second circuit — prepare for the last (second) merge round
        InnerBuilder circuit2{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit2);

        // Create a shared native transcript for the last merge and the subsequent de-interleaving.
        auto prover_transcript = std::make_shared<NativeTranscript>();
        MergeProver<BATCH_SIZE> merge_prover{ op_queue, prover_transcript };

        // Step 1: construct the merge proof — this exports the first transcript slice.
        auto merge_proof = merge_prover.construct_proof();

        // Step 2: construct the de-interleaving proof on the *same* transcript — this exports the
        // second transcript slice starting right after the merge slice.
        auto de_interleaving_proof = merge_prover.construct_de_interleaving_proof();

        // Compute input commitments required by the merge verifier (interleaved per-column).
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_previous_ultra_ops_table_columns();
        PolynomialBatch t_current_batch(t_current);
        PolynomialBatch T_prev_batch(T_prev);

        std::array<curve::BN254::AffineElement, NUM_COLUMNS> native_t_commitments;
        std::array<curve::BN254::AffineElement, NUM_COLUMNS> native_T_prev_commitments;
        for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
            native_t_commitments[idx] =
                merge_prover.pcs_commitment_key.template commit_interleaved<BATCH_SIZE>(t_current_batch[idx]);
            native_T_prev_commitments[idx] =
                merge_prover.pcs_commitment_key.template commit_interleaved<BATCH_SIZE>(T_prev_batch[idx]);
        }

        // Independently compute the expected de-interleaved wire commitments from the op-queue.
        // These are commitments to each individual wire polynomial (not interleaved), and should
        // match what the de-interleaving prover sends in the proof.
        auto merged_table = op_queue->construct_ultra_ops_table_columns();
        std::array<curve::BN254::AffineElement, NUM_WIRES> expected_de_interleaved_commitments;
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            expected_de_interleaved_commitments[idx] = merge_prover.pcs_commitment_key.commit(merged_table[idx]);
        }

        // Create builder (only used in recursive context).
        BuilderType builder;

        // Wrap commitments and proofs in the appropriate type (native or stdlib).
        InputCommitments input_commitments;
        for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
            input_commitments.t_commitments[idx] = create_commitment(builder, native_t_commitments[idx]);
            input_commitments.T_prev_commitments[idx] = create_commitment(builder, native_T_prev_commitments[idx]);
        }
        Proof merge_proof_typed = create_proof(builder, merge_proof);
        Proof de_interleaving_proof_typed = create_proof(builder, de_interleaving_proof);

        // Both verifications share the same transcript so that the Fiat-Shamir challenges in the
        // de-interleaving proof are derived from the combined transcript state.
        auto verifier_transcript = std::make_shared<Transcript>();
        MergeVerifierType verifier{ MergeSettings::PREPEND, verifier_transcript };

        // Verify the last merge proof (consumes the first slice from the shared transcript).
        auto merge_result = verifier.reduce_to_pairing_check(merge_proof_typed, input_commitments);

        // Verify the de-interleaving proof (appends and consumes the second slice).
        auto de_interleaving_result = verifier.reduce_de_interleaving_to_pairing_check(de_interleaving_proof_typed,
                                                                                       merge_result.merged_commitments);

        // Test 1: Pairing points are valid for both the merge and de-interleaving checks.
        EXPECT_TRUE(merge_result.pairing_points.check()) << "Merge pairing check failed";
        EXPECT_TRUE(de_interleaving_result.pairing_points.check()) << "De-interleaving pairing check failed";

        // Test 2: De-interleaved commitments returned by the verifier match the expected ones.
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            EXPECT_EQ(to_native(de_interleaving_result.de_interleaved_merged_commitments[idx]),
                      expected_de_interleaved_commitments[idx])
                << "De-interleaved commitment mismatch at wire index " << idx;
        }

        // Test 3: Circuit is satisfied (recursive context only).
        if constexpr (IsRecursive) {
            EXPECT_TRUE(check_circuit(builder)) << "Circuit check failed in recursive context";
        }
    }
};

template <typename Curve, size_t BATCH_SIZE_> class MergeTestParams {
  public:
    using CurveType = Curve;
    static constexpr size_t BATCH_SIZE = BATCH_SIZE_;
};

// Define test types: native and recursive contexts
using Parameters = ::testing::Types<MergeTestParams<curve::BN254, 1>,
                                    MergeTestParams<stdlib::bn254<MegaCircuitBuilder>, 1>,
                                    MergeTestParams<stdlib::bn254<UltraCircuitBuilder>, 1>,
                                    MergeTestParams<curve::BN254, 2>,
                                    MergeTestParams<stdlib::bn254<MegaCircuitBuilder>, 2>,
                                    MergeTestParams<stdlib::bn254<UltraCircuitBuilder>, 2>,
                                    MergeTestParams<curve::BN254, 4>,                        // Native
                                    MergeTestParams<stdlib::bn254<MegaCircuitBuilder>, 4>,   // Recursive (Mega)
                                    MergeTestParams<stdlib::bn254<UltraCircuitBuilder>, 4>>; // Recursive (Ultra)

TYPED_TEST_SUITE(MergeTests, Parameters);

TYPED_TEST(MergeTests, MergeProofSizeCheck)
{
    TestFixture::test_merge_proof_size();
}

TYPED_TEST(MergeTests, SingleMerge)
{
    TestFixture::test_single_merge();
}

TYPED_TEST(MergeTests, MultipleMergesPrepend)
{
    TestFixture::test_multiple_merges_prepend();
}

TYPED_TEST(MergeTests, MergePrependThenAppend)
{
    TestFixture::test_merge_prepend_then_append();
}

TYPED_TEST(MergeTests, DegreeCheckFailurePrepend)
{
    TestFixture::test_degree_check_failure(MergeSettings::PREPEND);
}

TYPED_TEST(MergeTests, DegreeCheckFailureAppend)
{
    TestFixture::test_degree_check_failure(MergeSettings::APPEND);
}

TYPED_TEST(MergeTests, MergeFailurePrepend)
{
    TestFixture::test_merge_failure(MergeSettings::PREPEND);
}

TYPED_TEST(MergeTests, MergeFailureAppend)
{
    TestFixture::test_merge_failure(MergeSettings::APPEND);
}

TYPED_TEST(MergeTests, EvalFailurePrepend)
{
    TestFixture::test_eval_failure(MergeSettings::PREPEND);
}

TYPED_TEST(MergeTests, EvalFailureAppend)
{
    TestFixture::test_eval_failure(MergeSettings::APPEND);
}

TYPED_TEST(MergeTests, DeInterleavingProof)
{
    TestFixture::test_de_interleaving();
}

/**
 * @brief Test that mixing values from different transcript instances causes instant failure
 * @details Simulates a realistic scenario where a circuit contains two merge verifiers, each with
 * their own transcript instance, and accidentally tries to use commitments from one verifier with
 * the other verifier's transcript. This is a critical security vulnerability that the OriginTag
 * system must detect.
 *
 * The test creates two separate transcript instances (simulating two independent verifiers in the
 * same circuit) and attempts to mix their values. The OriginTag system detects the parent tag
 * mismatch and throws: "Tags from different transcripts were involved in the same computation"
 *
 * Only runs in recursive context where OriginTag tracking is active.
 */
TYPED_TEST(MergeTests, DifferentTranscriptOriginTagFailure)
{
    if constexpr (!TestFixture::IsRecursive) {
        GTEST_SKIP() << "OriginTag tests only apply to recursive context";
    }

    using BuilderType = typename TestFixture::BuilderType;
    using MergeVerifierType = typename TestFixture::MergeVerifierType;
    using Transcript = typename TestFixture::Transcript;
    using InnerFlavor = MegaFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    constexpr size_t NUM_COLUMNS = TestFixture::NUM_COLUMNS;
    constexpr size_t BATCH_SIZE = TestFixture::NUM_WIRES / NUM_COLUMNS;

    // Create single builder for both verifiers (realistic - both in same circuit)
    BuilderType builder;

    // === Generate two separate merge proofs (simulating two independent merge operations) ===
    auto op_queue_1 = std::make_shared<ECCOpQueue>();
    InnerBuilder circuit_1{ op_queue_1 };
    GoblinMockCircuits::construct_simple_circuit(circuit_1);
    auto prover_transcript_1 = std::make_shared<NativeTranscript>();
    MergeProver<BATCH_SIZE> prover_1{ op_queue_1, prover_transcript_1 };
    auto proof_1 = prover_1.construct_proof();

    auto op_queue_2 = std::make_shared<ECCOpQueue>();
    InnerBuilder circuit_2{ op_queue_2 };
    GoblinMockCircuits::construct_simple_circuit(circuit_2);
    auto prover_transcript_2 = std::make_shared<NativeTranscript>();
    MergeProver<BATCH_SIZE> prover_2{ op_queue_2, prover_transcript_2 };
    auto proof_2 = prover_2.construct_proof();

    // Get native commitments for proof 1 (will be used with verifier 1's transcript)
    auto t_1 = op_queue_1->construct_current_ultra_ops_subtable_columns();
    auto T_prev_1 = op_queue_1->construct_previous_ultra_ops_table_columns();
    std::array<curve::BN254::AffineElement, NUM_COLUMNS> native_t_commitments_1;
    std::array<curve::BN254::AffineElement, NUM_COLUMNS> native_T_prev_commitments_1;
    for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
        native_t_commitments_1[idx] = prover_1.pcs_commitment_key.commit(t_1[idx]);
        native_T_prev_commitments_1[idx] = prover_1.pcs_commitment_key.commit(T_prev_1[idx]);
    }

    // === Create first verifier with its own transcript instance ===
    auto transcript_1 = std::make_shared<Transcript>();
    [[maybe_unused]] MergeVerifierType verifier_1{ MergeSettings::PREPEND, transcript_1 };

    [[maybe_unused]] auto proof_1_recursive = TestFixture::create_proof(builder, proof_1);

    // Create commitments for verifier 1 - these will be "owned" by transcript_1
    // When we read from the proof using transcript_1, those values get tagged with transcript_1's parent_tag
    typename MergeVerifierType::InputCommitments input_commitments_1;
    for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
        input_commitments_1.t_commitments[idx] = TestFixture::create_commitment(builder, native_t_commitments_1[idx]);
        input_commitments_1.T_prev_commitments[idx] =
            TestFixture::create_commitment(builder, native_T_prev_commitments_1[idx]);
    }

    // === Create second verifier with a DIFFERENT transcript instance ===
    // This simulates having two independent merge verifiers in the same circuit
    auto transcript_2 = std::make_shared<Transcript>();
    MergeVerifierType verifier_2{ MergeSettings::PREPEND, transcript_2 };

    auto proof_2_recursive = TestFixture::create_proof(builder, proof_2);

    // Get the parent tags to show they're different
    OriginTag tag_1 = extract_transcript_tag(*transcript_1);
    OriginTag tag_2 = extract_transcript_tag(*transcript_2);

    info("Verifier 1 transcript_index: ", tag_1.transcript_index);
    info("Verifier 2 transcript_index: ", tag_2.transcript_index);
    ASSERT_NE(tag_1.transcript_index, tag_2.transcript_index) << "Transcripts should have different parent tags";

    // === SECURITY VIOLATION: Try to use commitments from proof 1 with verifier 2 ===

    // To make this more realistic, we need to actually receive values from transcript_1 into the commitments
    // In a real scenario, the verifier would receive_from_prover which tags values with the transcript's parent_tag
    // For this test, we'll manually tag the commitments as if they came from transcript_1
    OriginTag transcript_1_tag(tag_1.transcript_index, 0, /*is_submitted=*/true);
    for (size_t idx = 0; idx < NUM_COLUMNS; idx++) {
        // Tag these commitments as if they were read from transcript_1
        if constexpr (TestFixture::IsRecursive) {
            input_commitments_1.t_commitments[idx].set_origin_tag(transcript_1_tag);
            input_commitments_1.T_prev_commitments[idx].set_origin_tag(transcript_1_tag);
        }
    }

    // Now try to verify proof_2 using verifier_2 (with transcript_2) but with commitments tagged for transcript_1
    // When verifier_2 reads from proof_2_recursive using transcript_2, those values will have tag_2.parent_tag
    // When it tries to mix them with input_commitments_1 (which have tag_1.parent_tag), the check should trigger
    info("Attempting to mix transcript_1 commitments with transcript_2 proof verification...");

    // Catch the exception and verify it's the expected cross-transcript error
#ifndef NDEBUG
    EXPECT_THROW_WITH_MESSAGE([[maybe_unused]] auto result =
                                  verifier_2.reduce_to_pairing_check(proof_2_recursive, input_commitments_1),
                              "Tags from different transcripts were involved in the same computation");
#endif
}

/**
 * @brief Test class for merge protocol transcript pinning tests
 * @details Tests only native merge protocol (not recursive) to ensure transcript stability
 */
template <typename BatchSizeTag> class MergeTranscriptTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static constexpr size_t BATCH_SIZE = BatchSizeTag::value;
    static constexpr size_t NUM_WIRES = 4;
    static constexpr size_t NUM_COLUMNS = NUM_WIRES / BATCH_SIZE;

    /**
     * @brief Construct the expected manifest for a Merge protocol proof
     * @details This defines the expected transcript structure. Tests warn if prover/verifier deviates from this.
     * @note Entries consist of a name string and size (in bb::frs), NOT actual data.
     * @return TranscriptManifest
     */
    static TranscriptManifest construct_merge_manifest()
    {
        TranscriptManifest manifest_expected;

        // Size calculations
        size_t frs_per_Fr = 1;                                                      // Native field element
        size_t frs_per_G = FrCodec::calc_num_fields<curve::BN254::AffineElement>(); // Commitment = 4 frs
        size_t frs_per_uint32 = 1;                                                  // shift_size

        size_t round = 0;

        // Round 0: Prover sends shift_size and merged table commitments, gets degree check challenges
        manifest_expected.add_entry(round, "shift_size", frs_per_uint32);
        for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
            manifest_expected.add_entry(round, "MERGED_TABLE_" + std::to_string(idx), frs_per_G);
        }
        manifest_expected.add_challenge(round, "LEFT_TABLE_DEGREE_CHECK_0");
        manifest_expected.add_challenge(round, "LEFT_TABLE_DEGREE_CHECK_1");
        manifest_expected.add_challenge(round, "LEFT_TABLE_DEGREE_CHECK_2");
        manifest_expected.add_challenge(round, "LEFT_TABLE_DEGREE_CHECK_3");

        // Round 1: Batching challenges + kappa, then send batched polynomial commitment
        round++;
        for (size_t idx = 0; idx < 13; ++idx) {
            manifest_expected.add_challenge(round, "SHPLONK_MERGE_BATCHING_CHALLENGE_" + std::to_string(idx));
        }
        manifest_expected.add_challenge(round, "kappa");
        manifest_expected.add_entry(round, "REVERSED_BATCHED_LEFT_TABLES", frs_per_G);

        // Round 2: Shplonk opening challenge, then send all evaluations and quotient
        round++;
        manifest_expected.add_challenge(round, "shplonk_opening_challenge");
        for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
            manifest_expected.add_entry(round, "LEFT_TABLE_EVAL_" + std::to_string(idx), frs_per_Fr);
        }
        for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
            manifest_expected.add_entry(round, "RIGHT_TABLE_EVAL_" + std::to_string(idx), frs_per_Fr);
        }
        for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
            manifest_expected.add_entry(round, "MERGED_TABLE_EVAL_" + std::to_string(idx), frs_per_Fr);
        }
        manifest_expected.add_entry(round, "REVERSED_BATCHED_LEFT_TABLES_EVAL", frs_per_Fr);
        manifest_expected.add_entry(round, "SHPLONK_BATCHED_QUOTIENT", frs_per_G);

        // Round 3: KZG masking challenge, then send W commitment
        round++;
        manifest_expected.add_challenge(round, "KZG:masking_challenge");
        manifest_expected.add_entry(round, "KZG:W", frs_per_G);

        return manifest_expected;
    }
};

using BatchSizes = ::testing::Types<std::integral_constant<size_t, 1>>;
TYPED_TEST_SUITE(MergeTranscriptTests, BatchSizes);

/**
 * @brief Ensure consistency between the hardcoded manifest and the one generated by the merge prover
 */
TYPED_TEST(MergeTranscriptTests, ProverManifestConsistency)
{
    using InnerFlavor = MegaFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;

    // Construct a simple circuit to generate merge proof
    auto op_queue = std::make_shared<ECCOpQueue>();
    InnerBuilder circuit{ op_queue };
    GoblinMockCircuits::construct_simple_circuit(circuit);

    // Construct merge proof with manifest enabled
    auto transcript = std::make_shared<NativeTranscript>();
    transcript->enable_manifest();
    MergeProver<TestFixture::BATCH_SIZE> merge_prover{ op_queue, transcript };
    auto merge_proof = merge_prover.construct_proof();

    // Check prover manifest matches expected manifest
    auto manifest_expected = TestFixture::construct_merge_manifest();
    auto prover_manifest = transcript->get_manifest();

    ASSERT_GT(manifest_expected.size(), 0);
    ASSERT_EQ(prover_manifest.size(), manifest_expected.size())
        << "Prover manifest has " << prover_manifest.size() << " rounds, expected " << manifest_expected.size();

    for (size_t round = 0; round < manifest_expected.size(); ++round) {
        ASSERT_EQ(prover_manifest[round], manifest_expected[round]) << "Prover manifest discrepancy in round " << round;
    }
}

/**
 * @brief Ensure consistency between prover and verifier manifests
 */
TYPED_TEST(MergeTranscriptTests, VerifierManifestConsistency)
{
    using InnerFlavor = MegaFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;

    // Construct a simple circuit
    auto op_queue = std::make_shared<ECCOpQueue>();
    InnerBuilder circuit{ op_queue };
    GoblinMockCircuits::construct_simple_circuit(circuit);

    // Generate merge proof with prover manifest enabled
    auto prover_transcript = std::make_shared<NativeTranscript>();
    prover_transcript->enable_manifest();
    MergeProver<TestFixture::BATCH_SIZE> merge_prover{ op_queue, prover_transcript };
    auto merge_proof = merge_prover.construct_proof();

    // Construct commitments for verifier
    typename MergeVerifier<TestFixture::BATCH_SIZE>::InputCommitments merge_commitments;
    auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
    auto T_prev = op_queue->construct_previous_ultra_ops_table_columns();
    for (size_t idx = 0; idx < TestFixture::NUM_COLUMNS; idx++) {
        merge_commitments.t_commitments[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
        merge_commitments.T_prev_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_prev[idx]);
    }

    // Verify proof with verifier manifest enabled
    auto verifier_transcript = std::make_shared<NativeTranscript>();
    verifier_transcript->enable_manifest();
    MergeVerifier<TestFixture::BATCH_SIZE> merge_verifier{ MergeSettings::PREPEND, verifier_transcript };
    auto result = merge_verifier.reduce_to_pairing_check(merge_proof, merge_commitments);

    // Verification should succeed
    ASSERT_TRUE(result.pairing_points.check() && result.reduction_succeeded);

    // Check prover and verifier manifests match
    auto prover_manifest = prover_transcript->get_manifest();
    auto verifier_manifest = verifier_transcript->get_manifest();

    ASSERT_GT(prover_manifest.size(), 0);
    ASSERT_EQ(prover_manifest.size(), verifier_manifest.size())
        << "Prover has " << prover_manifest.size() << " rounds, verifier has " << verifier_manifest.size();

    for (size_t round = 0; round < prover_manifest.size(); ++round) {
        ASSERT_EQ(prover_manifest[round], verifier_manifest[round])
            << "Prover/Verifier manifest discrepancy in round " << round;
    }
}

} // namespace bb
