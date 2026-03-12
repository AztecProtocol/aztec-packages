// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/goblin/batch_merge_prover.hpp"
#include "barretenberg/goblin/batch_merge_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

// Helper traits to extract Builder type from Curve (same pattern as merge.test.cpp)
template <typename Curve, typename = void> struct BatchMergeBuildTypeHelper {
    struct DummyBuilder {};
    using type = DummyBuilder;
};
template <typename Curve> struct BatchMergeBuildTypeHelper<Curve, std::enable_if_t<Curve::is_stdlib_type>> {
    using type = typename Curve::Builder;
};

namespace {

using NativeG1 = curve::BN254::AffineElement;

/**
 * @brief Populate the current (already-initialized) subtable in op_queue with a few ECC ops.
 */
void populate_subtable(const std::shared_ptr<ECCOpQueue>& op_queue, size_t num_ops)
{
    for (size_t i = 0; i < num_ops; ++i) {
        op_queue->add_accumulate(NativeG1::random_element());
        op_queue->mul_accumulate(NativeG1::random_element(), bb::fr::random_element());
        op_queue->eq_and_reset();
    }
}

/**
 * @brief Create an op_queue containing N finalized subtables.
 */
std::shared_ptr<ECCOpQueue> make_op_queue_with_n_subtables(size_t N)
{
    auto op_queue = std::make_shared<ECCOpQueue>();
    for (size_t i = 0; i < N; ++i) {
        if (i > 0) {
            op_queue->initialize_new_subtable();
        }
        populate_subtable(op_queue, 1 + (i * 2));
        op_queue->merge(MergeSettings::PREPEND);
    }
    return op_queue;
}

} // namespace

// ============================================================
// Test parameters — templated on Curve and BATCH_SIZE
// ============================================================

template <typename CurveType_, size_t BATCH_SIZE_> struct BatchMergeTestParams {
    using CurveType = CurveType_;
    static constexpr size_t BATCH_SIZE = BATCH_SIZE_;
};

// ============================================================
// Typed test fixture — parametric over Curve and BATCH_SIZE
// ============================================================

template <typename TestParams> class BatchMergeTests : public testing::Test {
  public:
    using Curve = typename TestParams::CurveType;
    static constexpr size_t BATCH_SIZE = TestParams::BATCH_SIZE;
    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static constexpr size_t NUM_COLUMNS = NUM_WIRES / BATCH_SIZE;
    // Small M keeps tests fast; real code uses CHONK_MAX_ACCUMULATION_STEPS (32).
    static constexpr size_t MAX_SUBTABLES = 4;

    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using BatchMergeVerifierType = BatchMergeVerifier_<BATCH_SIZE, Curve>;
    using Transcript = typename BatchMergeVerifierType::Transcript;
    using Proof = typename BatchMergeVerifierType::Proof;
    using TableCommitments = typename BatchMergeVerifierType::TableCommitments;
    using BuilderType = typename BatchMergeBuildTypeHelper<Curve>::type;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // --------------------------------------------------------
    // Context-dispatch helpers
    // --------------------------------------------------------

    /**
     * @brief Extract the native value from a stdlib or native type.
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
     * @brief Return whether the builder's circuit is satisfied (only meaningful in recursive context).
     */
    static bool check_circuit(BuilderType& builder)
    {
        if constexpr (IsRecursive) {
            return CircuitChecker::check(builder);
        } else {
            (void)builder;
            return true;
        }
    }

    /**
     * @brief Wrap a native proof as the Proof type for the current Curve.
     * @details In native context this is a no-op.  In recursive context the proof elements
     * become circuit witnesses via stdlib::Proof.
     */
    static Proof create_proof(BuilderType& builder, const std::vector<bb::fr>& native_proof)
    {
        if constexpr (IsRecursive) {
            return stdlib::Proof<BuilderType>(builder, native_proof);
        } else {
            (void)builder;
            return native_proof;
        }
    }

    /**
     * @brief Convert a native hash value to the scalar field type of the current Curve.
     * @details In native context this is a no-op.  In recursive context the hash becomes a
     * circuit witness.
     */
    static FF create_hash_ff(BuilderType& builder, const bb::fr& native_hash)
    {
        if constexpr (IsRecursive) {
            FF hash_ff = FF::from_witness(&builder, native_hash);
            // The hash is an external input (from the kernel accumulation loop), not read from
            // the verifier transcript, so it must not carry the "free witness" tag that would
            // prevent it from interacting with transcript-origin-tagged elements inside the
            // verifier circuit.
            hash_ff.unset_free_witness_tag();
            return hash_ff;
        } else {
            (void)builder;
            return native_hash;
        }
    }

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
     *
     * Tamper operates on the native (pre-witness) proof bytes.
     */
    static void tamper_proof(std::vector<bb::fr>& proof, TamperMode mode, size_t M)
    {
        static constexpr size_t NUM_FRS_COMM = NativeTranscript::Codec::template calc_num_fields<NativeG1>();

        switch (mode) {
        case TamperMode::ColumnCommitment: {
            // First column commitment starts at: 1 (N) + M (shift_sizes)
            const size_t idx = 1 + M;
            proof[idx] += bb::fr(1);
            break;
        }
        case TamperMode::MergedTableCommitment: {
            // Merged-table commitments start after column commitments
            const size_t idx = 1 + M + M * NUM_COLUMNS * NUM_FRS_COMM;
            proof[idx] += bb::fr(1);
            break;
        }
        case TamperMode::ReversedColsEval: {
            // reversed_cols_eval comes after all column/merged/reversed commitments and c_evals/t_evals
            const size_t commits_size = (M * NUM_COLUMNS + NUM_COLUMNS + 1) * NUM_FRS_COMM;
            const size_t evals_before = M * NUM_COLUMNS + NUM_COLUMNS;
            const size_t idx = 1 + M + commits_size + evals_before;
            proof[idx] += bb::fr(1);
            break;
        }
        default:
            break;
        }
    }

    /**
     * @brief Compute the running hash over the N actual subtable column commitments in the proof.
     *
     * @details Mimics the hash accumulated during the kernel loop: for each of the N*NUM_COLUMNS
     * real column commitments (packed into the proof right after N and the shift_sizes), apply one
     * Poseidon2 step, carrying the running hash forward.  The result is the value that the tail
     * kernel would pass into the batch-merge verifier as the `hash` argument.
     *
     * Always computed on native field elements, regardless of the Curve template parameter.
     */
    static bb::fr compute_running_hash(const std::vector<bb::fr>& proof, size_t N, size_t M)
    {
        static constexpr size_t NUM_FRS_COMM = NativeTranscript::Codec::template calc_num_fields<NativeG1>();

        // The verifier's calculated_hash loop processes subtable_cols[M*NC-1] down to [0], using
        // hash_inputs.insert(begin, col_serialized) followed by hash_inputs = {calculated_hash}.
        // This means:
        //   - iteration 0: hash_inputs = [col_fields]                 (no previous hash)
        //   - iteration k: hash_inputs = [col_fields, prev_hash]
        //
        // Real subtables occupy slots M-N..M-1, so their columns are at proof positions
        // (M*NC-1) down to (M-N)*NC in the column area (0-indexed from start of column area).
        // The first N*NC iterations of the verifier process exactly these real entries.
        //
        // We replicate those N*NC iterations here to produce the intermediate hash that the
        // extension loop expects as its starting point (the external `hash` argument).
        std::vector<bb::fr> hash_inputs;
        bb::fr hash_val(0);
        for (size_t i = 0; i < N * NUM_COLUMNS; i++) {
            // Proof column area starts at 1+M. Verifier processes flat index M*NC-1-i first.
            const size_t base = 1 + M + (M * NUM_COLUMNS - 1 - i) * NUM_FRS_COMM;
            std::vector<bb::fr> col_serialized;
            for (size_t j = 0; j < NUM_FRS_COMM; j++) {
                col_serialized.push_back(proof[base + j]);
            }
            // Prepend col fields before the running hash, matching verifier's insert(begin, ...).
            hash_inputs.insert(hash_inputs.begin(), col_serialized.begin(), col_serialized.end());
            hash_val = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(hash_inputs);
            hash_inputs = { hash_val };
        }
        return hash_val;
    }

    // --------------------------------------------------------
    // Core prove-and-verify helper
    // --------------------------------------------------------
    struct Result {
        bool pairing_ok;
        bool reduction_ok;
        // circuit_ok is true for native context (trivially) and reflects CircuitChecker::check
        // for recursive context.
        bool circuit_ok;
        TableCommitments merged_commitments;
    };

    static Result prove_and_verify(const std::shared_ptr<ECCOpQueue>& op_queue,
                                   size_t M = MAX_SUBTABLES,
                                   TamperMode tamper = TamperMode::None)
    {
        // 1. Prove — always native; the batch merge prover has no recursive counterpart.
        auto prover_transcript = std::make_shared<NativeTranscript>();
        BatchMergeProver<BATCH_SIZE> prover{ op_queue, prover_transcript, M };
        auto native_proof = prover.construct_proof();

        // 2. Compute the native running hash from the N actual column commitments.
        const size_t N = op_queue->get_num_subtables();
        bb::fr native_hash = compute_running_hash(native_proof, N, M);

        // 3. Apply any proof tampering (not Hash mode — that corrupts the hash instead).
        if (tamper != TamperMode::None && tamper != TamperMode::Hash) {
            tamper_proof(native_proof, tamper, M);
        }

        // 4. Corrupt the hash if requested.
        if (tamper == TamperMode::Hash) {
            native_hash += bb::fr(1);
        }

        // 5. Create a builder (only materialised in recursive context).
        BuilderType builder;

        // 6. Wrap proof and hash into the types expected by BatchMergeVerifierType.
        Proof proof = create_proof(builder, native_proof);
        FF hash_ff = create_hash_ff(builder, native_hash);

        // 7. Verify.
        auto verifier_transcript = std::make_shared<Transcript>();
        BatchMergeVerifierType verifier{ M, verifier_transcript };
        auto result = verifier.reduce_to_pairing_check(proof, hash_ff);

        // 8. In recursive context, check that the constructed circuit is satisfied.
        bool circuit_ok = check_circuit(builder);

        return { result.pairing_points.check(), result.reduction_succeeded, circuit_ok, result.merged_commitments };
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
        EXPECT_TRUE(res.circuit_ok);
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
        EXPECT_TRUE(res.circuit_ok);
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
        EXPECT_TRUE(res.circuit_ok);
    }

    /**
     * @brief The merged-table commitments returned by the verifier must match those independently
     *        computed from the op_queue table columns.
     */
    static void test_verifier_returns_correct_merged_commitments()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);

        // Independently compute expected merged-table commitments (always native).
        auto prover_transcript_cmt = std::make_shared<NativeTranscript>();
        BatchMergeProver<BATCH_SIZE> prover_cmt{ op_queue, prover_transcript_cmt, MAX_SUBTABLES };
        auto merged_cols = op_queue->construct_ultra_ops_table_columns();

        using PolynomialBatch = MergeProver<BATCH_SIZE>::PolynomialBatch;
        PolynomialBatch merged_batch(merged_cols);

        std::array<NativeG1, NUM_COLUMNS> expected_merged;
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            expected_merged[col] =
                prover_cmt.pcs_commitment_key.template commit_interleaved<BATCH_SIZE>(merged_batch[col]);
        }

        auto res = prove_and_verify(op_queue, MAX_SUBTABLES);
        EXPECT_TRUE(res.pairing_ok);
        EXPECT_TRUE(res.reduction_ok);
        EXPECT_TRUE(res.circuit_ok);
        for (size_t col = 0; col < NUM_COLUMNS; ++col) {
            EXPECT_EQ(to_native(res.merged_commitments[col]), expected_merged[col])
                << "Merged table commitment mismatch at column " << col;
        }
    }

    /**
     * @brief Tampering with a column commitment changes the transcript challenges,
     *        invalidates the hash check, and breaks the KZG proof.
     */
    static void test_failure_tampered_column_commitment()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);
        auto res = prove_and_verify(op_queue, MAX_SUBTABLES, TamperMode::ColumnCommitment);
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
     * @details In recursive context, the failed assert_equal constraint also makes the circuit
     * unsatisfied.
     */
    static void test_failure_wrong_hash()
    {
        auto op_queue = make_op_queue_with_n_subtables(2);
        auto res = prove_and_verify(op_queue, MAX_SUBTABLES, TamperMode::Hash);
        EXPECT_FALSE(res.reduction_ok);
        if constexpr (IsRecursive) {
            EXPECT_FALSE(res.circuit_ok);
        }
    }
};

// ============================================================
// Transcript manifest test fixture — native-only
//
// Manifests are a NativeTranscript concept and do not apply to the recursive context,
// so this fixture is not templated on Curve.
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
        static constexpr size_t NUM_FRS_COMM =
            NativeTranscript::Codec::template calc_num_fields<curve::BN254::AffineElement>();
        const size_t N = op_queue->get_num_subtables();
        // Replicate the verifier's calculated_hash loop for the N*NC real subtable entries
        // (same logic as BatchMergeTests::compute_running_hash).
        std::vector<bb::fr> hash_inputs;
        bb::fr hash_val(0);
        for (size_t i = 0; i < N * NUM_COLUMNS; i++) {
            const size_t base = 1 + MAX_SUBTABLES + (MAX_SUBTABLES * NUM_COLUMNS - 1 - i) * NUM_FRS_COMM;
            std::vector<bb::fr> col_serialized;
            for (size_t j = 0; j < NUM_FRS_COMM; j++) {
                col_serialized.push_back(proof[base + j]);
            }
            hash_inputs.insert(hash_inputs.begin(), col_serialized.begin(), col_serialized.end());
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

        ASSERT_GT(prover_manifest.size(), 0U);
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

using Parameters = ::testing::Types<BatchMergeTestParams<curve::BN254, 1>,
                                    BatchMergeTestParams<stdlib::bn254<MegaCircuitBuilder>, 1>,
                                    BatchMergeTestParams<curve::BN254, 4>,
                                    BatchMergeTestParams<stdlib::bn254<MegaCircuitBuilder>, 4>>;

TYPED_TEST_SUITE(BatchMergeTests, Parameters);

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

// Manifest tests — native only (manifests are a NativeTranscript concept)
using ManifestTestParameters = ::testing::Types<BatchMergeManifestTestParams<1>, BatchMergeManifestTestParams<4>>;

TYPED_TEST_SUITE(BatchMergeManifestTests, ManifestTestParameters);

TYPED_TEST(BatchMergeManifestTests, ProverVerifierManifestConsistency)
{
    TestFixture::test_prover_verifier_manifest_consistency();
}

} // namespace bb
