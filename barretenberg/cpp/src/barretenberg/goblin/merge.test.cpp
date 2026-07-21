#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
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
template <typename Curve> class MergeTests : public testing::Test {
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

    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

    // Builder type is only available in recursive context
    using BuilderType = typename BuilderTypeHelper<Curve>::type;

    enum class TamperProofMode : uint8_t { None, MCommitment, LEval };

    static std::shared_ptr<ECCOpQueue> construct_final_merge_op_queue(const size_t num_subtables_up_to_tail = 1)
    {
        using InnerFlavor = MegaFlavor;
        using InnerBuilder = typename InnerFlavor::CircuitBuilder;

        auto op_queue = std::make_shared<ECCOpQueue>();
        for (size_t idx = 0; idx < num_subtables_up_to_tail; ++idx) {
            InnerBuilder circuit{ op_queue };
            GoblinMockCircuits::construct_simple_circuit(circuit);
            op_queue->merge();
        }

        op_queue->construct_zk_columns();

        InnerBuilder hiding_circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(hiding_circuit);

        // The merge protocol is only used for the hiding kernel, whose subtable has a fixed size. The prover and
        // verifier both rely on this (the verifier hard-codes the shift size from it), so pad the final subtable to
        // match.
        BB_ASSERT_LTE(op_queue->get_current_subtable_size(), bb::HIDING_KERNEL_ULTRA_OPS);
        while (op_queue->get_current_subtable_size() < bb::HIDING_KERNEL_ULTRA_OPS) {
            op_queue->no_op_ultra_only();
        }
        return op_queue;
    }

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
        const size_t m_commitment_idx = 0; // Index of first commitment to merged table in merge proof
        const size_t l_eval_idx = 21;      // Index of first evaluation of l(1/kappa) in merge proof

        switch (tampering_mode) {
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
                                       const TamperProofMode tampering_mode = TamperProofMode::None,
                                       const bool expected = true)
    {
        // Create native merge proof
        auto prover_transcript = std::make_shared<NativeTranscript>();
        MergeProver merge_prover{ op_queue, prover_transcript };
        auto native_proof = merge_prover.construct_proof();
        tamper_with_proof(native_proof, tampering_mode);

        // Construct shifted column polynomials matching the circuit's ecc_op_wire layout
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_table_columns_up_to_tail();

        std::array<curve::BN254::AffineElement, NUM_WIRES> native_t_commitments;
        std::array<curve::BN254::AffineElement, NUM_WIRES> native_T_prev_commitments;
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            native_t_commitments[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
            native_T_prev_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_prev[idx]);
        }

        auto T_merged = op_queue->construct_ultra_ops_table_columns();
        std::array<curve::BN254::AffineElement, NUM_WIRES> expected_merged_commitments;
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            expected_merged_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_merged[idx]);
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
        MergeVerifierType verifier{ transcript };
        auto result = verifier.reduce_to_pairing_check(proof, input_commitments);

        // Perform pairing check and verify
        bool pairing_verified = result.pairing_points.check();
        bool verified = pairing_verified && result.reduction_succeeded;
        EXPECT_EQ(verified, expected);

        // If verification is expected to succeed, also check that the merged table commitments match
        if (expected) {
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
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
        auto op_queue = construct_final_merge_op_queue();

        // Construct a merge proof and ensure its size matches expectation
        auto transcript = std::make_shared<NativeTranscript>();
        MergeProver merge_prover{ op_queue, transcript };
        auto merge_proof = merge_prover.construct_proof();

        EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
    }

    /**
     * @brief Test basic merge proof construction and verification
     */
    static void test_single_merge()
    {
        auto op_queue = construct_final_merge_op_queue();

        prove_and_verify_merge(op_queue);
    }

    /**
     * @brief Test a final merge proof with multiple historical subtables up to the tail.
     */
    static void test_multiple_merges()
    {
        auto op_queue = construct_final_merge_op_queue(/*num_subtables_up_to_tail=*/3);
        prove_and_verify_merge(op_queue);
    }

    /**
     * @brief Test failure when m ≠ l + X^k r
     */
    static void test_merge_failure()
    {
        auto op_queue = construct_final_merge_op_queue();

        prove_and_verify_merge(op_queue, TamperProofMode::MCommitment, false);
    }

    /**
     * @brief Test failure when g_j(kappa) ≠ kappa^{k-1} * l_j(1/kappa)
     */
    static void test_eval_failure()
    {
        auto op_queue = construct_final_merge_op_queue();

        prove_and_verify_merge(op_queue, TamperProofMode::LEval, false);
    }

    /**
     * @brief Test failure when deg(l) ≥ shift_size
     * @details The verifier hard-codes the shift size, so a malicious prover cannot lie about it. Instead we
     * exhibit an (ad-hoc) op queue whose left table is larger than the hard-coded shift size and construct an
     * otherwise-honest proof for it: the concatenation identity M = L + X^shift·R and all PCS openings hold, but
     * the degree-check polynomial G can only reverse the first `shift` coefficients of the batched left table, so
     * the degree identity Σᵢ Lᵢ(κ)·βᵢ = G(κ⁻¹)·κ^{shift-1} fails on the dropped high-degree coefficients. This is
     * the structural guarantee that the op queue's fixed-append asserts enforce on the honest path.
     */
    static void test_degree_check_failure()
    {
        if constexpr (IsRecursive) {
            GTEST_SKIP() << "Native-only test";
            return;
        }
        if constexpr (!IsRecursive) {
            using Polynomial = bb::Polynomial<bb::fr>;
            using CommitmentKey = bb::CommitmentKey<curve::BN254>;

            // The shift size the verifier hard-codes (see MergeVerifier::reduce_to_pairing_check).
            const size_t shift_size =
                ECCOpQueue::compute_fixed_append_offset(ECCOpQueue::get_append_offset_for_verifier());

            // Left table deliberately exceeds the hard-coded shift size; right table is small.
            const size_t left_size = shift_size + 2;
            const size_t right_size = 4;
            const size_t merged_size = shift_size + right_size;

            std::array<Polynomial, NUM_WIRES> left_table;
            std::array<Polynomial, NUM_WIRES> right_table;
            std::array<Polynomial, NUM_WIRES> merged_table;
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                left_table[idx] = Polynomial::random(left_size);
                right_table[idx] = Polynomial::random(right_size);
                // M = L + X^shift·R, so the concatenation identity holds and only the degree check fails.
                merged_table[idx] = Polynomial(merged_size);
                for (size_t i = 0; i < left_size; i++) {
                    merged_table[idx].at(i) += left_table[idx].at(i);
                }
                for (size_t i = 0; i < right_size; i++) {
                    merged_table[idx].at(shift_size + i) += right_table[idx].at(i);
                }
            }

            CommitmentKey ck(merged_size);
            auto prover_transcript = std::make_shared<NativeTranscript>();

            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                prover_transcript->send_to_verifier("MERGED_TABLE_" + std::to_string(idx),
                                                    ck.commit(merged_table[idx]));
            }

            std::array<std::string, 4> degree_labels = { "LEFT_TABLE_DEGREE_CHECK_0",
                                                         "LEFT_TABLE_DEGREE_CHECK_1",
                                                         "LEFT_TABLE_DEGREE_CHECK_2",
                                                         "LEFT_TABLE_DEGREE_CHECK_3" };
            auto degree_check_challenges = prover_transcript->template get_challenges<bb::fr>(degree_labels);

            // Batched left table, then keep only the first `shift_size` coefficients when reversing into G. The
            // high-degree coefficients at indices ≥ shift_size are silently dropped — exactly what makes the degree
            // identity fail at the verifier.
            Polynomial batched_left_tables(left_size);
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                batched_left_tables.add_scaled(left_table[idx], degree_check_challenges[idx]);
            }
            Polynomial reversed_batched_left_tables(shift_size);
            for (size_t j = 0; j < shift_size; j++) {
                reversed_batched_left_tables.at(j) = batched_left_tables.at(shift_size - 1 - j);
            }
            prover_transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES",
                                                ck.commit(reversed_batched_left_tables));

            bb::fr kappa = prover_transcript->template get_challenge<bb::fr>("kappa");
            bb::fr kappa_inv = kappa.invert();

            std::vector<bb::fr> evals;
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                evals.emplace_back(left_table[idx].evaluate(kappa));
                prover_transcript->send_to_verifier("LEFT_TABLE_EVAL_" + std::to_string(idx), evals.back());
            }
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                evals.emplace_back(right_table[idx].evaluate(kappa));
                prover_transcript->send_to_verifier("RIGHT_TABLE_EVAL_" + std::to_string(idx), evals.back());
            }
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                evals.emplace_back(merged_table[idx].evaluate(kappa));
                prover_transcript->send_to_verifier("MERGED_TABLE_EVAL_" + std::to_string(idx), evals.back());
            }
            evals.emplace_back(reversed_batched_left_tables.evaluate(kappa_inv));
            prover_transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES_EVAL", evals.back());

            std::array<std::string, 13> shplonk_labels = {
                "SHPLONK_MERGE_BATCHING_CHALLENGE_0",  "SHPLONK_MERGE_BATCHING_CHALLENGE_1",
                "SHPLONK_MERGE_BATCHING_CHALLENGE_2",  "SHPLONK_MERGE_BATCHING_CHALLENGE_3",
                "SHPLONK_MERGE_BATCHING_CHALLENGE_4",  "SHPLONK_MERGE_BATCHING_CHALLENGE_5",
                "SHPLONK_MERGE_BATCHING_CHALLENGE_6",  "SHPLONK_MERGE_BATCHING_CHALLENGE_7",
                "SHPLONK_MERGE_BATCHING_CHALLENGE_8",  "SHPLONK_MERGE_BATCHING_CHALLENGE_9",
                "SHPLONK_MERGE_BATCHING_CHALLENGE_10", "SHPLONK_MERGE_BATCHING_CHALLENGE_11",
                "SHPLONK_MERGE_BATCHING_CHALLENGE_12"
            };
            auto shplonk_batching_challenges = prover_transcript->template get_short_challenges<bb::fr>(shplonk_labels);

            // Replicate MergeProver's Shplonk batched quotient so the PCS opening verifies honestly.
            std::array<std::array<Polynomial, NUM_WIRES>*, 3> tables = { &left_table, &right_table, &merged_table };
            Polynomial shplonk_batched_quotient(merged_size);
            for (size_t table_idx = 0; table_idx < 3; table_idx++) {
                for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                    bb::fr challenge = shplonk_batching_challenges[(table_idx * NUM_WIRES) + idx];
                    shplonk_batched_quotient.add_scaled((*tables[table_idx])[idx], challenge);
                    shplonk_batched_quotient.at(0) -= challenge * evals[(table_idx * NUM_WIRES) + idx];
                }
            }
            shplonk_batched_quotient.factor_roots(kappa);
            {
                Polynomial reversed_copy(reversed_batched_left_tables);
                reversed_copy.at(0) -= evals.back();
                reversed_copy.factor_roots(kappa_inv);
                shplonk_batched_quotient.add_scaled(reversed_copy, shplonk_batching_challenges.back());
            }
            prover_transcript->send_to_verifier("SHPLONK_BATCHED_QUOTIENT", ck.commit(shplonk_batched_quotient));

            bb::fr z = prover_transcript->template get_challenge<bb::fr>("shplonk_opening_challenge");
            Polynomial Q_prime(std::move(shplonk_batched_quotient));
            Q_prime *= -(z - kappa);
            for (size_t table_idx = 0; table_idx < 3; table_idx++) {
                for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                    bb::fr challenge = shplonk_batching_challenges[(table_idx * NUM_WIRES) + idx];
                    Q_prime.add_scaled((*tables[table_idx])[idx], challenge);
                    Q_prime.at(0) -= challenge * evals[(table_idx * NUM_WIRES) + idx];
                }
            }
            {
                Polynomial reversed_copy(reversed_batched_left_tables);
                reversed_copy.at(0) -= evals.back();
                Q_prime.add_scaled(reversed_copy,
                                   shplonk_batching_challenges.back() * (z - kappa) * (z - kappa_inv).invert());
            }

            ProverOpeningClaim<curve::BN254> opening_claim = { .polynomial = std::move(Q_prime),
                                                               .opening_pair = { z, bb::fr(0) } };
            KZG<curve::BN254>::compute_opening_proof(ck, opening_claim, prover_transcript);

            auto native_proof = prover_transcript->export_proof();

            InputCommitments input_commitments;
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                input_commitments.t_commitments[idx] = ck.commit(right_table[idx]);
                input_commitments.T_prev_commitments[idx] = ck.commit(left_table[idx]);
            }

            auto verifier_transcript = std::make_shared<NativeTranscript>();
            MergeVerifierType verifier{ verifier_transcript };
            auto result = verifier.reduce_to_pairing_check(native_proof, input_commitments);

            // The PCS opening (pairing) is honest and passes; the degree check is what rejects the proof.
            EXPECT_TRUE(result.pairing_points.check());
            EXPECT_FALSE(result.reduction_succeeded);
        } // if constexpr (!IsRecursive)
    }
};

// Define test types: native and recursive contexts
using CurveTypes = ::testing::Types<curve::BN254,                        // Native
                                    stdlib::bn254<MegaCircuitBuilder>,   // Recursive (Mega)
                                    stdlib::bn254<UltraCircuitBuilder>>; // Recursive (Ultra)

TYPED_TEST_SUITE(MergeTests, CurveTypes);

TYPED_TEST(MergeTests, MergeProofSizeCheck)
{
    TestFixture::test_merge_proof_size();
}

TYPED_TEST(MergeTests, SingleMerge)
{
    TestFixture::test_single_merge();
}

TYPED_TEST(MergeTests, MultipleMerges)
{
    TestFixture::test_multiple_merges();
}

TYPED_TEST(MergeTests, MergeFailure)
{
    TestFixture::test_merge_failure();
}

TYPED_TEST(MergeTests, EvalFailure)
{
    TestFixture::test_eval_failure();
}

TYPED_TEST(MergeTests, DegreeCheckFailure)
{
    TestFixture::test_degree_check_failure();
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
    constexpr size_t NUM_WIRES = TestFixture::NUM_WIRES;

    // Create single builder for both verifiers (realistic - both in same circuit)
    BuilderType builder;

    // === Generate two separate merge proofs (simulating two independent merge operations) ===
    auto op_queue_1 = TestFixture::construct_final_merge_op_queue();
    auto prover_transcript_1 = std::make_shared<NativeTranscript>();
    MergeProver prover_1{ op_queue_1, prover_transcript_1 };
    auto proof_1 = prover_1.construct_proof();

    auto op_queue_2 = TestFixture::construct_final_merge_op_queue();
    auto prover_transcript_2 = std::make_shared<NativeTranscript>();
    MergeProver prover_2{ op_queue_2, prover_transcript_2 };
    auto proof_2 = prover_2.construct_proof();

    // Get native commitments for proof 1 (shifted to match circuit ecc_op_wire layout)
    auto t_1 = op_queue_1->construct_current_ultra_ops_subtable_columns();
    auto T_prev_1 = op_queue_1->construct_table_columns_up_to_tail();
    std::array<curve::BN254::AffineElement, NUM_WIRES> native_t_commitments_1;
    std::array<curve::BN254::AffineElement, NUM_WIRES> native_T_prev_commitments_1;
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        native_t_commitments_1[idx] = prover_1.pcs_commitment_key.commit(t_1[idx]);
        native_T_prev_commitments_1[idx] = prover_1.pcs_commitment_key.commit(T_prev_1[idx]);
    }

    // === Create first verifier with its own transcript instance ===
    auto transcript_1 = std::make_shared<Transcript>();
    [[maybe_unused]] MergeVerifierType verifier_1{ transcript_1 };

    [[maybe_unused]] auto proof_1_recursive = TestFixture::create_proof(builder, proof_1);

    // Create commitments for verifier 1 - these will be "owned" by transcript_1
    // When we read from the proof using transcript_1, those values get tagged with transcript_1's parent_tag
    typename MergeVerifierType::InputCommitments input_commitments_1;
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        input_commitments_1.t_commitments[idx] = TestFixture::create_commitment(builder, native_t_commitments_1[idx]);
        input_commitments_1.T_prev_commitments[idx] =
            TestFixture::create_commitment(builder, native_T_prev_commitments_1[idx]);
    }

    // === Create second verifier with a DIFFERENT transcript instance ===
    // This simulates having two independent merge verifiers in the same circuit
    auto transcript_2 = std::make_shared<Transcript>();
    MergeVerifierType verifier_2{ transcript_2 };

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
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
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
class MergeTranscriptTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

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

        size_t round = 0;

        // Round 0: Prover sends merged table commitments, gets degree check challenges
        for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
            manifest_expected.add_entry(round, "MERGED_TABLE_" + std::to_string(idx), frs_per_G);
        }
        manifest_expected.add_challenge(round, "LEFT_TABLE_DEGREE_CHECK_0");
        manifest_expected.add_challenge(round, "LEFT_TABLE_DEGREE_CHECK_1");
        manifest_expected.add_challenge(round, "LEFT_TABLE_DEGREE_CHECK_2");
        manifest_expected.add_challenge(round, "LEFT_TABLE_DEGREE_CHECK_3");

        // Round 1: degre check polynomial, kappa
        round++;
        manifest_expected.add_entry(round, "REVERSED_BATCHED_LEFT_TABLES", frs_per_G);
        manifest_expected.add_challenge(round, "kappa");

        // Round 2: evaluations of all tables at kappa, 1/kappa, shplonk challenges
        round++;
        for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
            manifest_expected.add_entry(round, "LEFT_TABLE_EVAL_" + std::to_string(idx), frs_per_Fr);
        }
        for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
            manifest_expected.add_entry(round, "RIGHT_TABLE_EVAL_" + std::to_string(idx), frs_per_Fr);
        }
        for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
            manifest_expected.add_entry(round, "MERGED_TABLE_EVAL_" + std::to_string(idx), frs_per_Fr);
        }
        manifest_expected.add_entry(round, "REVERSED_BATCHED_LEFT_TABLES_EVAL", frs_per_Fr);

        for (size_t idx = 0; idx < (3 * NUM_WIRES) + 1; ++idx) {
            manifest_expected.add_challenge(round, "SHPLONK_MERGE_BATCHING_CHALLENGE_" + std::to_string(idx));
        }

        // Round 3: Shplonk quotient, shplonk opening challenge
        round++;
        manifest_expected.add_entry(round, "SHPLONK_BATCHED_QUOTIENT", frs_per_G);
        manifest_expected.add_challenge(round, "shplonk_opening_challenge");

        // Round 4: KZG:W
        round++;
        manifest_expected.add_entry(round, "KZG:W", frs_per_G);

        return manifest_expected;
    }
};

/**
 * @brief Ensure consistency between the hardcoded manifest and the one generated by the merge prover
 */
TEST_F(MergeTranscriptTests, ProverManifestConsistency)
{
    auto op_queue = MergeTests<curve::BN254>::construct_final_merge_op_queue();

    // Construct merge proof with manifest enabled
    auto transcript = std::make_shared<NativeTranscript>();
    transcript->enable_manifest();
    MergeProver merge_prover{ op_queue, transcript };
    auto merge_proof = merge_prover.construct_proof();

    // Check prover manifest matches expected manifest
    auto manifest_expected = construct_merge_manifest();
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
TEST_F(MergeTranscriptTests, VerifierManifestConsistency)
{
    auto op_queue = MergeTests<curve::BN254>::construct_final_merge_op_queue();

    // Generate merge proof with prover manifest enabled
    auto prover_transcript = std::make_shared<NativeTranscript>();
    prover_transcript->enable_manifest();
    MergeProver merge_prover{ op_queue, prover_transcript };
    auto merge_proof = merge_prover.construct_proof();

    // Construct commitments for verifier (shifted to match circuit ecc_op_wire layout)
    MergeVerifier::InputCommitments merge_commitments;
    auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
    auto T_prev = op_queue->construct_table_columns_up_to_tail();
    for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
        merge_commitments.t_commitments[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
        merge_commitments.T_prev_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_prev[idx]);
    }

    // Verify proof with verifier manifest enabled
    auto verifier_transcript = std::make_shared<NativeTranscript>();
    verifier_transcript->enable_manifest();
    MergeVerifier merge_verifier{ verifier_transcript };
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
