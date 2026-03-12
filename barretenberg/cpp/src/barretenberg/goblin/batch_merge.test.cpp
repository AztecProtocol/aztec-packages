// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/goblin/batch_merge_prover.hpp"
#include "barretenberg/goblin/batch_merge_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

namespace {

using G1 = curve::BN254::AffineElement;
using Fr = curve::BN254::ScalarField;

/**
 * @brief Populate the current (already-initialized) subtable in op_queue with a few ECC ops.
 */
void populate_subtable(const std::shared_ptr<ECCOpQueue>& op_queue)
{
    op_queue->add_accumulate(G1::random_element());
    op_queue->mul_accumulate(G1::random_element(), Fr::random_element());
    op_queue->eq_and_reset();
}

/**
 * @brief Create an op_queue containing N finalized subtables.
 *
 * @details The ECCOpQueue constructor initializes the first subtable. For each subsequent subtable we call
 * initialize_new_subtable() → populate → merge(PREPEND).
 */
std::shared_ptr<ECCOpQueue> make_op_queue_with_n_subtables(size_t N)
{
    auto op_queue = std::make_shared<ECCOpQueue>();
    for (size_t i = 0; i < N; ++i) {
        if (i > 0) {
            op_queue->initialize_new_subtable();
        }
        populate_subtable(op_queue);
        op_queue->merge(MergeSettings::PREPEND);
    }
    return op_queue;
}

} // namespace

// ============================================================
// Typed test fixture — parametric over BATCH_SIZE
// ============================================================

template <size_t BATCH_SIZE_> struct BatchMergeTestParams {
    static constexpr size_t BATCH_SIZE = BATCH_SIZE_;
};

template <typename TestParams> class BatchMergeTests : public testing::Test {
  public:
    static constexpr size_t BATCH_SIZE = TestParams::BATCH_SIZE;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static constexpr size_t NUM_COLUMNS = NUM_WIRES / BATCH_SIZE;
    // Small M keeps tests fast; real code uses CHONK_MAX_ACCUMULATION_STEPS (32).
    static constexpr size_t MAX_SUBTABLES = 4;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // --------------------------------------------------------
    // Tamper helpers
    // --------------------------------------------------------
    enum class TamperMode { None, ColumnCommitment, MergedTableCommitment, ReversedColsEval, Hash };

    /**
     * @brief Proof byte-layout (all field elements, sizes in FFs):
     *
     *  [0]           : N  (num_subtables, uint32 serialized as 1 FF)
     *  [1 .. M]      : shift_size_i  (M uint32s)
     *  [M+1 ..]      : M*NUM_COLUMNS column commitments    (each 4 FFs)
     *  [..]          : NUM_COLUMNS merged-table commitments (each 4 FFs)
     *  [..]          : REVERSED_COLUMNS commitment          (4 FFs)
     *  [..]          : M*NUM_COLUMNS  c_evals               (1 FF each)
     *  [..]          : NUM_COLUMNS    t_evals               (1 FF each)
     *  [..]          : 1 reversed_cols_eval
     *  [..]          : SHPLONK_Q commitment                 (4 FFs)
     *  [..]          : KZG:W  commitment                    (4 FFs)
     */
    static void tamper_proof(std::vector<Fr>& proof, TamperMode mode, size_t M)
    {
        static constexpr size_t NUM_FRS_COMM = NativeTranscript::Codec::template calc_num_fields<G1>();

        switch (mode) {
        case TamperMode::ColumnCommitment: {
            // First column commitment starts at: 1 (N) + M (shift_sizes)
            const size_t idx = 1 + M;
            proof[idx] += Fr(1);
            break;
        }
        case TamperMode::MergedTableCommitment: {
            // Merged-table commitments start after column commitments
            const size_t idx = 1 + M + M * NUM_COLUMNS * NUM_FRS_COMM;
            proof[idx] += Fr(1);
            break;
        }
        case TamperMode::ReversedColsEval: {
            // reversed_cols_eval comes after all column/merged/reversed commitments and c_evals/t_evals
            const size_t commits_size = (M * NUM_COLUMNS + NUM_COLUMNS + 1) * NUM_FRS_COMM;
            const size_t evals_before = M * NUM_COLUMNS + NUM_COLUMNS;
            const size_t idx = 1 + M + commits_size + evals_before;
            proof[idx] += Fr(1);
            break;
        }
        default:
            break;
        }
    }

    // --------------------------------------------------------
    // Core prove-and-verify helper
    // --------------------------------------------------------
    struct Result {
        bool pairing_ok;
        bool reduction_ok;
        typename BatchMergeVerifier<BATCH_SIZE>::TableCommitments merged_commitments;
    };

    /**
     * @brief Compute the running hash over the N actual subtable column commitments in the proof.
     *
     * @details Mimics the hash accumulated during the kernel loop: for each of the N*NUM_COLUMNS
     * real column commitments (packed into the proof right after N and the shift_sizes), apply one
     * Poseidon2 step, carrying the running hash forward.  The result is the value that the tail
     * kernel would pass into the batch-merge verifier as the `hash` argument.
     */
    static Fr compute_running_hash(const std::vector<Fr>& proof, size_t N, size_t M)
    {
        static constexpr size_t NUM_FRS_COMM = NativeTranscript::Codec::template calc_num_fields<G1>();

        // Column commitments start at index 1 (N) + M (shift_sizes).
        std::vector<Fr> hash_inputs;
        Fr hash_val(0);
        for (size_t i = 0; i < N * NUM_COLUMNS; i++) {
            const size_t base = 1 + M + i * NUM_FRS_COMM;
            for (size_t j = 0; j < NUM_FRS_COMM; j++) {
                hash_inputs.push_back(proof[base + j]);
            }
            hash_val = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(hash_inputs);
            hash_inputs = { hash_val };
        }
        return hash_val;
    }

    static Result prove_and_verify(const std::shared_ptr<ECCOpQueue>& op_queue,
                                   size_t M = MAX_SUBTABLES,
                                   TamperMode tamper = TamperMode::None)
    {
        // Prove
        auto prover_transcript = std::make_shared<NativeTranscript>();
        BatchMergeProver<BATCH_SIZE> prover{ op_queue, prover_transcript, M };
        auto proof = prover.construct_proof();

        // Compute the running hash from the N actual subtable column commitments in the proof.
        const size_t N = op_queue->get_num_subtables();
        Fr hash = compute_running_hash(proof, N, M);

        // Tamper with the proof (if requested) before verification.
        if (tamper != TamperMode::None && tamper != TamperMode::Hash) {
            tamper_proof(proof, tamper, M);
        }

        // For the Hash tamper mode, corrupt the running hash passed to the verifier.
        Fr verify_hash = hash;
        if (tamper == TamperMode::Hash) {
            verify_hash += Fr(1);
        }

        // Verify
        auto verifier_transcript = std::make_shared<NativeTranscript>();
        BatchMergeVerifier<BATCH_SIZE> verifier{ M, verifier_transcript };
        auto result = verifier.reduce_to_pairing_check(proof, verify_hash);

        return { result.pairing_points.check(), result.reduction_succeeded, result.merged_commitments };
    }

    // --------------------------------------------------------
    // Individual test methods
    // --------------------------------------------------------

    /**
     * @brief Single subtable: the simplest possible batch merge.
     */
    static void test_single_subtable()
    {
        auto op_queue = make_op_queue_with_n_subtables(1);
        auto res = prove_and_verify(op_queue);
        EXPECT_TRUE(res.pairing_ok);
        EXPECT_TRUE(res.reduction_ok);
    }

    /**
     * @brief Three subtables with MAX_SUBTABLES = 4 (N < M, padding is used).
     */
    static void test_multiple_subtables_padded()
    {
        auto op_queue = make_op_queue_with_n_subtables(3);
        auto res = prove_and_verify(op_queue, /*M=*/4);
        EXPECT_TRUE(res.pairing_ok);
        EXPECT_TRUE(res.reduction_ok);
    }

    /**
     * @brief N == M: all subtable slots are used with no padding.
     */
    static void test_subtables_fills_max()
    {
        auto op_queue = make_op_queue_with_n_subtables(MAX_SUBTABLES);
        auto res = prove_and_verify(op_queue, /*M=*/MAX_SUBTABLES);
        EXPECT_TRUE(res.pairing_ok);
        EXPECT_TRUE(res.reduction_ok);
    }

    /**
     * @brief The merged-table commitments returned by the verifier must match those independently
     *        computed from the op_queue table columns.
     */
    static void test_verifier_returns_correct_merged_commitments()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);

        // Independently compute expected merged-table commitments
        auto prover_transcript_cmt = std::make_shared<NativeTranscript>();
        BatchMergeProver<BATCH_SIZE> prover_cmt{ op_queue, prover_transcript_cmt, MAX_SUBTABLES };
        auto merged_cols = op_queue->construct_ultra_ops_table_columns();

        using PolynomialBatch = MergeProver<BATCH_SIZE>::PolynomialBatch;
        PolynomialBatch merged_batch(merged_cols);

        std::array<G1, NUM_COLUMNS> expected_merged;
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            expected_merged[col] =
                prover_cmt.pcs_commitment_key.template commit_interleaved<BATCH_SIZE>(merged_batch[col]);
        }

        // Prove & verify, capture merged commitments
        auto res = prove_and_verify(op_queue, MAX_SUBTABLES);
        EXPECT_TRUE(res.pairing_ok);
        EXPECT_TRUE(res.reduction_ok);
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            EXPECT_EQ(res.merged_commitments[col], expected_merged[col])
                << "Merged table commitment mismatch at column " << col;
        }
    }

    /**
     * @brief Tampering with a column commitment changes the transcript challenges and invalidates the KZG proof.
     */
    static void test_failure_tampered_column_commitment()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);
        auto res = prove_and_verify(op_queue, MAX_SUBTABLES, TamperMode::ColumnCommitment);
        // Either the pairing fails or the algebraic check fails (or both).
        EXPECT_FALSE(res.pairing_ok && res.reduction_ok);
    }

    /**
     * @brief Tampering with the merged-table commitment invalidates the KZG proof.
     */
    static void test_failure_tampered_merged_table_commitment()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);
        auto res = prove_and_verify(op_queue, MAX_SUBTABLES, TamperMode::MergedTableCommitment);
        EXPECT_FALSE(res.pairing_ok && res.reduction_ok);
    }

    /**
     * @brief Tampering with the reversed-columns evaluation breaks the algebraic degree check.
     */
    static void test_failure_tampered_evaluation()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);
        auto res = prove_and_verify(op_queue, MAX_SUBTABLES, TamperMode::ReversedColsEval);
        EXPECT_FALSE(res.pairing_ok && res.reduction_ok);
    }

    /**
     * @brief Passing a wrong running hash causes the hash consistency check to fail.
     */
    static void test_failure_wrong_hash()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);
        auto res = prove_and_verify(op_queue, MAX_SUBTABLES, TamperMode::Hash);
        EXPECT_FALSE(res.reduction_ok);
    }
};

// ============================================================
// Transcript manifest test fixture (native, batch_size=1 only
// since manifest is independent of BATCH_SIZE logic)
// ============================================================

template <size_t BATCH_SIZE_> struct BatchMergeManifestTestParams {
    static constexpr size_t BATCH_SIZE = BATCH_SIZE_;
};

template <typename TestParams> class BatchMergeManifestTests : public testing::Test {
  public:
    static constexpr size_t BATCH_SIZE = TestParams::BATCH_SIZE;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static constexpr size_t NUM_COLUMNS = NUM_WIRES / BATCH_SIZE;
    static constexpr size_t MAX_SUBTABLES = 4;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Verify that the prover and verifier transcripts produce identical manifests.
     *
     * @details A mismatch between the prover and verifier manifests indicates that one side is
     * sending/receiving data that the other does not, which is a bug in the protocol implementation.
     */
    static void test_prover_verifier_manifest_consistency()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);

        // Prover with manifest enabled
        auto prover_transcript = std::make_shared<NativeTranscript>();
        prover_transcript->enable_manifest();
        BatchMergeProver<BATCH_SIZE> prover{ op_queue, prover_transcript, MAX_SUBTABLES };
        auto proof = prover.construct_proof();

        // Compute the running hash from the N actual subtable column commitments.
        static constexpr size_t NUM_FRS_COMM = NativeTranscript::Codec::template calc_num_fields<G1>();
        const size_t N = op_queue->get_num_subtables();
        std::vector<Fr> hash_inputs;
        Fr hash_val(0);
        for (size_t i = 0; i < N * NUM_COLUMNS; i++) {
            const size_t base = 1 + MAX_SUBTABLES + i * NUM_FRS_COMM;
            for (size_t j = 0; j < NUM_FRS_COMM; j++) {
                hash_inputs.push_back(proof[base + j]);
            }
            hash_val = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(hash_inputs);
            hash_inputs = { hash_val };
        }

        // Verifier with manifest enabled
        auto verifier_transcript = std::make_shared<NativeTranscript>();
        verifier_transcript->enable_manifest();
        BatchMergeVerifier<BATCH_SIZE> verifier{ MAX_SUBTABLES, verifier_transcript };
        auto result = verifier.reduce_to_pairing_check(proof, hash_val);

        // Verification must succeed before checking manifests
        ASSERT_TRUE(result.pairing_points.check() && result.reduction_succeeded)
            << "Proof failed — cannot validate manifests";

        // Compare manifests round by round
        auto prover_manifest = prover_transcript->get_manifest();
        auto verifier_manifest = verifier_transcript->get_manifest();

        ASSERT_GT(prover_manifest.size(), 0u);
        ASSERT_EQ(prover_manifest.size(), verifier_manifest.size())
            << "Manifest size mismatch: prover=" << prover_manifest.size() << " verifier=" << verifier_manifest.size();

        for (size_t round = 0; round < prover_manifest.size(); ++round) {
            EXPECT_EQ(prover_manifest[round], verifier_manifest[round]) << "Manifest discrepancy in round " << round;
        }
    }
};

// ============================================================
// Test type registrations
// ============================================================

using TestParameters = ::testing::Types<BatchMergeTestParams<1>, BatchMergeTestParams<4>>;

TYPED_TEST_SUITE(BatchMergeTests, TestParameters);

TYPED_TEST(BatchMergeTests, SingleSubtable)
{
    TestFixture::test_single_subtable();
}

TYPED_TEST(BatchMergeTests, MultipleSubtablesPadded)
{
    TestFixture::test_multiple_subtables_padded();
}

TYPED_TEST(BatchMergeTests, SubtablesFillsMax)
{
    TestFixture::test_subtables_fills_max();
}

TYPED_TEST(BatchMergeTests, VerifierReturnsCorrectMergedCommitments)
{
    TestFixture::test_verifier_returns_correct_merged_commitments();
}

TYPED_TEST(BatchMergeTests, TamperedColumnCommitmentFails)
{
    TestFixture::test_failure_tampered_column_commitment();
}

TYPED_TEST(BatchMergeTests, TamperedMergedTableCommitmentFails)
{
    TestFixture::test_failure_tampered_merged_table_commitment();
}

TYPED_TEST(BatchMergeTests, TamperedEvaluationFails)
{
    TestFixture::test_failure_tampered_evaluation();
}

TYPED_TEST(BatchMergeTests, WrongHashFails)
{
    TestFixture::test_failure_wrong_hash();
}

// Manifest tests — run for both batch sizes
using ManifestTestParameters = ::testing::Types<BatchMergeManifestTestParams<1>, BatchMergeManifestTestParams<4>>;

TYPED_TEST_SUITE(BatchMergeManifestTests, ManifestTestParameters);

TYPED_TEST(BatchMergeManifestTests, ProverVerifierManifestConsistency)
{
    TestFixture::test_prover_verifier_manifest_consistency();
}

} // namespace bb
