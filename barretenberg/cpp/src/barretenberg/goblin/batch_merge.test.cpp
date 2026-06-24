// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/goblin/batch_merge_prover.hpp"
#include "barretenberg/goblin/batch_merge_verifier.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

using NativeCurve = curve::BN254;
using NativeG1 = NativeCurve::AffineElement;

static constexpr size_t NUM_FRS_COMM = NativeTranscript::Codec::template calc_num_fields<NativeG1>();

template <typename Curve, typename = void> struct BuilderTypeHelper {
    struct DummyBuilder {};
    using type = DummyBuilder;
};

template <typename Curve> struct BuilderTypeHelper<Curve, std::enable_if_t<Curve::is_stdlib_type>> {
    using type = typename Curve::Builder;
};

enum class FaultMode : uint8_t {
    NONE,
    WRONG_MERGED_TABLE,       // merged table commitment/evals/opening are self-consistent but table is wrong
    BAD_DEGREE_CHECK_POLY,    // degree-check commitment/eval/opening are self-consistent but polynomial is wrong
    PADDING_NOT_INFINITY,     // padded slot sends non-zero shift size and non-zero commitment/eval
    SHIFT_SIZE_MINUS_ONE,     // send k-1 as shift size for a subtable polynomial of size k
    ZK_TABLE_DEGREE_TOO_HIGH, // zk table has degree above verifier hard-coded ZK shift
    ZERO_SUBTABLES_CLAIM,     // send 0 as number of subtables,
    TOO_MANY_SUBTABLES,       // send a number of subtables above the max that the verifier is configured for
};

void populate_subtable(const std::shared_ptr<ECCOpQueue>& op_queue, size_t num_ops)
{
    for (size_t i = 0; i < num_ops; ++i) {
        op_queue->add_accumulate(NativeG1::random_element());
        op_queue->mul_accumulate(NativeG1::random_element(), bb::fr::random_element());
        op_queue->eq_and_reset();
    }
}

std::shared_ptr<ECCOpQueue> make_op_queue_with_n_subtables(size_t n)
{
    const size_t max_op_queue_ops = 10;
    auto op_queue = std::make_shared<ECCOpQueue>();
    for (size_t i = 0; i < n; ++i) {
        if (i > 0) {
            op_queue->initialize_new_subtable();
        }
        populate_subtable(op_queue, ((1 + i) % max_op_queue_ops) + 1); // +1 to avoid empty subtables
        op_queue->merge();
    }
    return op_queue;
}

/**
 * Running hash over all MAX_SUBTABLES slots.
 * Real subtables are in slots [0, ..., N-1]; padded slots [N, ..., MAX_SUBTABLES-1]
 * are hashed as well (their commitments should be points at infinity).
 */
bb::fr compute_running_hash(const std::vector<bb::fr>& proof, size_t N)
{
    std::vector<bb::fr> round_inputs;
    bb::fr previous_challenge(0);
    bool is_first_challenge = true;

    for (size_t subtable_idx = 0; subtable_idx < N; ++subtable_idx) {
        round_inputs.clear();
        if (!is_first_challenge) {
            round_inputs.push_back(previous_challenge);
        }
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            const size_t global_col_idx = (subtable_idx * NUM_WIRES) + col;
            const size_t base = (global_col_idx * NUM_FRS_COMM);
            for (size_t j = 0; j < NUM_FRS_COMM; ++j) {
                round_inputs.push_back(proof[base + j]);
            }
        }

        // Transcript logic: hash full round buffer, then split into two challenge parts; get_challenge uses part[0].
        const bb::fr full_hash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(round_inputs);
        previous_challenge = full_hash;
        is_first_challenge = false;
    }

    return previous_challenge;
}

/**
 * Local prover copy used only in tests, with controlled fault injection points.
 * Important: faults are applied before data is sent to transcript, so Fiat–Shamir remains consistent.
 */
class TweakableBatchMergeProver : public BatchMergeProver {
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using Transcript = NativeTranscript;

  public:
    explicit TweakableBatchMergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                                       size_t max_subtables,
                                       FaultMode mode = FaultMode::NONE)
        : BatchMergeProver(op_queue, max_subtables)
        , fault_mode(mode)
    {}

    MergeProof construct_proof()
    {
        const size_t M = max_subtables;

        // Step 1
        std::vector<std::array<Polynomial, NUM_WIRES>> subtable_cols = op_queue->construct_subtable_columns();

        size_t N = subtable_cols.size();

        std::vector<size_t> shift_sizes(N);
        size_t max_shift_size = 0;
        for (size_t i = 0; i < N; ++i) {
            shift_sizes[i] = subtable_cols[i][0].size();
            max_shift_size = std::max(max_shift_size, shift_sizes[i]);
        }

        // Step 2: commit subtable columns
        Polynomial zero_poly(0);
        for (size_t idx = 0; idx < N; ++idx) {
            for (size_t col = 0; col < NUM_WIRES; ++col) {
                const Polynomial& col_to_commit =
                    (fault_mode == FaultMode::ZERO_SUBTABLES_CLAIM) ? zero_poly : subtable_cols[idx][col];
                transcript->send_to_verifier("COLUMN_" + std::to_string(col) + "_" + std::to_string(idx),
                                             pcs_commitment_key.commit(col_to_commit));
            }
            [[maybe_unused]] FF _ = transcript->template get_challenge<FF>("HASH_" + std::to_string(idx));
        }

        Polynomial one_poly(1);
        one_poly.at(0) = 1;
        for (size_t idx = N; idx < M; ++idx) {
            for (size_t col = 0; col < NUM_WIRES; ++col) {
                const bool non_infinity_padding =
                    (fault_mode == FaultMode::PADDING_NOT_INFINITY && idx == N && col == 0);
                transcript->send_to_verifier("COLUMN_" + std::to_string(col) + "_" + std::to_string(idx),
                                             pcs_commitment_key.commit(non_infinity_padding ? one_poly : zero_poly));
            }
            [[maybe_unused]] FF _ = transcript->template get_challenge<FF>("HASH_" + std::to_string(idx));
        }

        // Step 2.b: Send the masking table
        std::array<Polynomial, NUM_WIRES> zk_columns = op_queue->construct_zk_columns();

        if (fault_mode == FaultMode::ZK_TABLE_DEGREE_TOO_HIGH) {
            for (size_t col = 0; col < NUM_WIRES; ++col) {
                // Make zk column degree exceed verifier's hard-coded ZK shift (= ZK_ULTRA_OPS).
                Polynomial larger_zk_col(zk_columns[col], zk_columns[col].size() + 1);
                larger_zk_col.at(larger_zk_col.size() - 1) = FF(1);
                zk_columns[col] = std::move(larger_zk_col);
            }
        }

        for (size_t col = 0; col < NUM_WIRES; ++col) {
            transcript->send_to_verifier("ZK_COLUMN_" + std::to_string(col),
                                         pcs_commitment_key.commit(zk_columns[col]));
        }
        max_shift_size = std::max(max_shift_size, zk_columns[0].size());

        // Step 2.c: Flatten the columns for easier utilisation
        std::vector<Polynomial> flattened_cols;
        flattened_cols.reserve((subtable_cols.size() * NUM_WIRES) + NUM_WIRES);
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            flattened_cols.push_back(std::move(zk_columns[col]));
        }
        for (auto& subtable_col : subtable_cols) {
            for (size_t col = 0; col < NUM_WIRES; ++col) {
                if (fault_mode == FaultMode::ZERO_SUBTABLES_CLAIM) {
                    flattened_cols.push_back(Polynomial(1));
                } else {
                    flattened_cols.push_back(std::move(subtable_col[col]));
                }
            }
        }

        // Step 3
        uint32_t sent_num_subtables = static_cast<uint32_t>(N);
        if (fault_mode == FaultMode::ZERO_SUBTABLES_CLAIM) {
            sent_num_subtables = 0;
        }
        transcript->send_to_verifier("NUM_SUBTABLES", sent_num_subtables);
        for (size_t i = 0; i < M; ++i) {
            uint32_t sent_shift_size = static_cast<uint32_t>(i < N ? shift_sizes[i] : 0);
            if (fault_mode == FaultMode::PADDING_NOT_INFINITY && i == N && N < M) {
                sent_shift_size = 1;
            }
            if (fault_mode == FaultMode::SHIFT_SIZE_MINUS_ONE && i == 0 && N > 0) {
                BB_ASSERT_GT(shift_sizes[0], 0U);
                sent_shift_size = static_cast<uint32_t>(shift_sizes[0] - 1);
            }
            if (fault_mode == FaultMode::ZERO_SUBTABLES_CLAIM && i == N && N < M) {
                sent_shift_size = 0;
            }
            transcript->send_to_verifier("SHIFT_SIZE_" + std::to_string(i), sent_shift_size);
        }

        // Step 4: merged table
        std::array<Polynomial, NUM_WIRES> merged_table(op_queue->construct_ultra_ops_table_columns());
        if (fault_mode == FaultMode::WRONG_MERGED_TABLE && !merged_table[0].is_empty()) {
            merged_table[0].at(0) += FF(1);
        } else if (fault_mode == FaultMode::ZERO_SUBTABLES_CLAIM) {
            for (size_t col = 0; col < NUM_WIRES; ++col) {
                merged_table[col] = Polynomial(1);
            }
        }
        for (size_t col = 0; col < NUM_WIRES; ++col) {
            transcript->send_to_verifier("MERGED_COLUMN_" + std::to_string(col),
                                         pcs_commitment_key.commit(merged_table[col]));
        }

        // Step 5
        const FF degree_check_challenge = transcript->template get_challenge<FF>("DEGREE_CHECK_CHALLENGE");
        const size_t num_degree_check_challenges = (M * NUM_WIRES) + NUM_WIRES;
        std::vector<FF> degree_check_challenges = { FF(1), degree_check_challenge };
        for (size_t idx = 2; idx < num_degree_check_challenges; ++idx) {
            degree_check_challenges.push_back(degree_check_challenges.back() * degree_check_challenge);
        }

        // Step 6: degree-check poly
        if (fault_mode == FaultMode::TOO_MANY_SUBTABLES) {
            // This is the case in which we test that if the prover sends more columns than the max number of tables
            // then the verifier rejects
            size_t diff = flattened_cols.size() - num_degree_check_challenges;
            for (size_t idx = 0; idx < diff * NUM_WIRES; ++idx) {
                // Add challenges for the extra columns sent by the prover
                degree_check_challenges.push_back(degree_check_challenges.back() * degree_check_challenge);
            }
        }

        Polynomial degree_check_poly =
            compute_degree_check_polynomial(flattened_cols, degree_check_challenges, max_shift_size);

        if (fault_mode == FaultMode::TOO_MANY_SUBTABLES) {
            // Remove the extra challenge added above to keep the degree check poly consistent with the rest of the
            // proof
            degree_check_challenges.pop_back();
        }

        if (fault_mode == FaultMode::BAD_DEGREE_CHECK_POLY && !degree_check_poly.is_empty()) {
            degree_check_poly.at(0) += FF(1);
        }

        transcript->send_to_verifier("DEGREE_CHECK_POLY", pcs_commitment_key.commit(degree_check_poly));

        // Step 7
        const FF kappa = transcript->template get_challenge<FF>("KAPPA");
        const FF kappa_inv = kappa.invert();

        // Step 8: evals
        std::vector<FF> evals;
        const size_t num_actual_flattened_cols = (N * NUM_WIRES) + NUM_WIRES;
        const size_t num_flattened_col_evals = (M * NUM_WIRES) + NUM_WIRES;
        for (size_t flat_idx = 0; flat_idx < num_flattened_col_evals; ++flat_idx) {
            FF eval = FF(0);
            if (flat_idx < num_actual_flattened_cols) {
                eval = flattened_cols[flat_idx].evaluate(kappa);
            } else if (fault_mode == FaultMode::PADDING_NOT_INFINITY && flat_idx == num_actual_flattened_cols) {
                eval = FF(1); // matches one_poly commitment at the first padded slot
            }
            evals.push_back(eval);
            transcript->send_to_verifier("C_EVAL_" + std::to_string(flat_idx), eval);
        }

        for (size_t col = 0; col < NUM_WIRES; ++col) {
            evals.push_back(merged_table[col].evaluate(kappa));
            transcript->send_to_verifier("MERGED_EVAL_" + std::to_string(col), evals.back());
        }

        evals.push_back(degree_check_poly.evaluate(kappa_inv));
        transcript->send_to_verifier("DEGREE_CHECK_EVAL", evals.back());

        // Step 9
        const size_t num_opening_claims = ((M + 1) * NUM_WIRES) + 1 + NUM_WIRES;
        std::vector<OpeningClaim> opening_claims;
        opening_claims.reserve(num_opening_claims);

        for (size_t idx = 0; idx < num_flattened_col_evals; ++idx) {
            if (idx < num_actual_flattened_cols) {
                opening_claims.push_back({ std::move(flattened_cols[idx]), { kappa, evals[idx] } });
            } else {
                opening_claims.push_back({ Polynomial(1), { kappa, FF(0) } });
            }
        }

        for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
            opening_claims.push_back(
                { std::move(merged_table[idx]), { kappa, evals[(M * NUM_WIRES) + NUM_WIRES + idx] } });
        }

        opening_claims.push_back({ std::move(degree_check_poly), { kappa_inv, evals.back() } });

        auto shplonk_opening_claim = ShplonkProver::prove(pcs_commitment_key, opening_claims, transcript);

        PCS::compute_opening_proof(pcs_commitment_key, shplonk_opening_claim, transcript);
        return transcript->export_proof();
    }

  private:
    FaultMode fault_mode;
};

// Custom parameter struct to hold both Curve type and NumSubtables value
template <typename Curve, size_t N> struct TestParam {
    using CurveType = Curve;
    static constexpr size_t NumSubtables = N;
};

// Specialize the fixture to extract both template parameters from TypeParam
template <typename Param> class BatchMergeTests : public testing::Test {
  public:
    using Curve = typename Param::CurveType;
    static constexpr size_t NumSubtables = Param::NumSubtables;
    using FF = typename Curve::ScalarField;
    using Verifier = BatchMergeVerifier_<Curve, NumSubtables>;
    using Proof = typename Verifier::Proof;
    using Transcript = typename Verifier::Transcript;
    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    using BuilderType = typename BuilderTypeHelper<Curve>::type;

    static constexpr size_t VERIFIER_NUM_GATES = NumSubtables == 9 ? 6184 : 23609;
    static constexpr size_t ZK_OFFSET = NumSubtables == 9 ? 666 : 520;

    struct VerifyResult {
        bool reduction_ok;
        bool pairing_ok;
        bool circuit_ok;
    };

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static Proof create_proof(BuilderType& builder, const std::vector<bb::fr>& native_proof)
    {
        if constexpr (IsRecursive) {
            stdlib::Proof<BuilderType> stdlib_proof(builder, native_proof);
            return stdlib_proof;
        } else {
            (void)builder;
            return native_proof;
        }
    }

    static FF create_hash(BuilderType& builder, const bb::fr& native_hash)
    {
        if constexpr (IsRecursive) {
            auto hash = FF::from_witness(&builder, native_hash);
            hash.unset_free_witness_tag();
            return hash;
        } else {
            (void)builder;
            return native_hash;
        }
    }

    static bool check_circuit(BuilderType& builder)
    {
        if constexpr (IsRecursive) {
            return CircuitChecker::check(builder);
        } else {
            (void)builder;
            return true;
        }
    }

    static VerifyResult prove_and_verify(const std::shared_ptr<ECCOpQueue>& op_queue,
                                         FaultMode fault_mode = FaultMode::NONE,
                                         bool wrong_hash = false,
                                         bool check_manifest = false)
    {
        TranscriptManifest prover_manifest;
        std::vector<bb::fr> native_proof;
        if (fault_mode == FaultMode::NONE) {
            BatchMergeProver prover{ op_queue, NumSubtables };
            if (check_manifest) {
                prover.transcript->enable_manifest();
            }

            native_proof = prover.construct_proof();
            if (check_manifest) {
                prover_manifest = prover.transcript->get_manifest();
            }
        } else {
            TweakableBatchMergeProver prover{ op_queue, NumSubtables, fault_mode };
            if (check_manifest) {
                prover.transcript->enable_manifest();
            }

            native_proof = prover.construct_proof();
            if (check_manifest) {
                prover_manifest = prover.transcript->get_manifest();
            }
        }

        bb::fr native_hash = compute_running_hash(native_proof, op_queue->num_subtables());
        if (wrong_hash) {
            native_hash += bb::fr(1);
        }

        BuilderType builder;
        Proof proof = create_proof(builder, native_proof);
        FF hash = create_hash(builder, native_hash);

        Verifier verifier;
        if (check_manifest) {
            verifier.transcript->enable_manifest();
        }
        auto result = verifier.reduce_to_pairing_check(proof, hash);

        if (check_manifest) {
            // Check consistency of manifests
            auto verifier_manifest = verifier.transcript->get_manifest();
            EXPECT_EQ(prover_manifest.size(), verifier_manifest.size());
            for (size_t i = 0; i < prover_manifest.size(); ++i) {
                EXPECT_EQ(prover_manifest[i], verifier_manifest[i]);
            }
        }

        if constexpr (Curve::is_stdlib_type) {
            EXPECT_EQ(builder.get_num_finalized_gates_inefficient(), VERIFIER_NUM_GATES + ZK_OFFSET);
        }

        return { result.reduction_succeeded, result.pairing_points.check(), check_circuit(builder) };
    }
};

using TestParams = ::testing::Types<TestParam<curve::BN254, 9>,
                                    TestParam<curve::BN254, CHONK_MAX_NUM_CIRCUITS>,
                                    TestParam<stdlib::bn254<MegaCircuitBuilder>, 9>,
                                    TestParam<stdlib::bn254<MegaCircuitBuilder>, CHONK_MAX_NUM_CIRCUITS>>;
TYPED_TEST_SUITE(BatchMergeTests, TestParams);

// Completeness

TYPED_TEST(BatchMergeTests, ValidProofPassesWithPadding)
{
    auto op_queue = make_op_queue_with_n_subtables(3);
    auto res = TestFixture::prove_and_verify(op_queue, FaultMode::NONE, false, /*check_manifest*/ true);
    EXPECT_TRUE(res.reduction_ok);
    EXPECT_TRUE(res.pairing_ok);
    EXPECT_TRUE(res.circuit_ok);
}

TYPED_TEST(BatchMergeTests, ValidProofMaxSizePasses)
{
    auto op_queue = make_op_queue_with_n_subtables(TestFixture::NumSubtables);
    auto res = TestFixture::prove_and_verify(op_queue);
    EXPECT_TRUE(res.reduction_ok);
    EXPECT_TRUE(res.pairing_ok);
    EXPECT_TRUE(res.circuit_ok);
}

// Soundness

TYPED_TEST(BatchMergeTests, ZeroSubtablesFails)
{
    BB_DISABLE_ASSERTS();
    auto op_queue = make_op_queue_with_n_subtables(3);
    auto res = TestFixture::prove_and_verify(op_queue, FaultMode::ZERO_SUBTABLES_CLAIM);
    EXPECT_FALSE(res.reduction_ok); // Caught by product check
    EXPECT_TRUE(res.pairing_ok);
    if constexpr (TestFixture::IsRecursive) {
        EXPECT_FALSE(res.circuit_ok);
    }
}

TYPED_TEST(BatchMergeTests, TooManySubtablesFails)
{
    if constexpr (!TestFixture::Curve::is_stdlib_type) {
        GTEST_SKIP() << "This test in native setting fails due to a deserialization failure. The verifier path in the "
                        "same for native and recursive code, so it's enough to test the recursive code.";
    } else {
        BB_DISABLE_ASSERTS();
        auto op_queue = make_op_queue_with_n_subtables(TestFixture::NumSubtables + 1);
        auto res = TestFixture::prove_and_verify(op_queue, FaultMode::TOO_MANY_SUBTABLES);
        EXPECT_FALSE(res.reduction_ok); // Caught by product check
        EXPECT_FALSE(res.pairing_ok);   // Verifier uses fewer commitments than the one sent
        if constexpr (TestFixture::IsRecursive) {
            EXPECT_FALSE(res.circuit_ok); // Assertions fail
        }
    }
}

TYPED_TEST(BatchMergeTests, WrongMergedTableFails)
{
    auto op_queue = make_op_queue_with_n_subtables(2);
    auto res = TestFixture::prove_and_verify(op_queue, FaultMode::WRONG_MERGED_TABLE);
    EXPECT_FALSE(res.reduction_ok); // Caught by the concatenation check
    EXPECT_TRUE(res.pairing_ok);
    if constexpr (TestFixture::IsRecursive) {
        EXPECT_FALSE(res.circuit_ok);
    }
}

TYPED_TEST(BatchMergeTests, WrongHashFails)
{
    auto op_queue = make_op_queue_with_n_subtables(4);
    auto res = TestFixture::prove_and_verify(op_queue, FaultMode::NONE, true);
    EXPECT_FALSE(res.reduction_ok); // Caught by the hash check
    EXPECT_TRUE(res.pairing_ok);
    if constexpr (TestFixture::IsRecursive) {
        EXPECT_FALSE(res.circuit_ok);
    }
}

TYPED_TEST(BatchMergeTests, BadSubtableDegreeCheckFails)
{
    auto op_queue = make_op_queue_with_n_subtables(6);
    auto res = TestFixture::prove_and_verify(op_queue, FaultMode::BAD_DEGREE_CHECK_POLY);
    EXPECT_FALSE(res.reduction_ok); // Caught by the degree check
    EXPECT_TRUE(res.pairing_ok);
    if constexpr (TestFixture::IsRecursive) {
        EXPECT_FALSE(res.circuit_ok);
    }
}

TYPED_TEST(BatchMergeTests, PaddingTableNotInfinityFails)
{
    auto op_queue = make_op_queue_with_n_subtables(3);
    auto res = TestFixture::prove_and_verify(op_queue, FaultMode::PADDING_NOT_INFINITY);
    EXPECT_FALSE(res.reduction_ok); // Caught by the degree check: shift sizes are zeroed out >= N
    EXPECT_TRUE(res.pairing_ok);    // PCS is consistent
    if constexpr (TestFixture::IsRecursive) {
        EXPECT_FALSE(res.circuit_ok); // Caught by the degree check: shift sizes are zeroed out >= N
    }
}

TYPED_TEST(BatchMergeTests, ShiftSizeMinusOneFailsReductionOnly)
{
    auto op_queue = make_op_queue_with_n_subtables(7);
    auto res = TestFixture::prove_and_verify(op_queue, FaultMode::SHIFT_SIZE_MINUS_ONE);
    EXPECT_FALSE(res.reduction_ok); // Caught by the degree check
    EXPECT_TRUE(res.pairing_ok);
    if constexpr (TestFixture::IsRecursive) {
        EXPECT_FALSE(res.circuit_ok);
    }
}

TYPED_TEST(BatchMergeTests, ZKTableDegreeTooHighFailsReductionOnly)
{
    auto op_queue = make_op_queue_with_n_subtables(5);
    auto res = TestFixture::prove_and_verify(op_queue, FaultMode::ZK_TABLE_DEGREE_TOO_HIGH);
    EXPECT_FALSE(res.reduction_ok); // Caught by degree/concatenation reductions via hard-coded ZK shift.
    EXPECT_TRUE(res.pairing_ok);    // PCS opening remains self-consistent with sent commitments/evals.
    if constexpr (TestFixture::IsRecursive) {
        EXPECT_FALSE(res.circuit_ok);
    }
}

// Static analysis of the recursive verifier circuit: every variable must belong to a single connected
// component (no disjoint subgraphs) and there must be no variables that participate in only one gate
// (i.e. no unconstrained witnesses).
TYPED_TEST(BatchMergeTests, GraphDescription)
{
    if constexpr (!TestFixture::IsRecursive) {
        GTEST_SKIP() << "Graph description analysis only applies to stdlib (recursive) verifier circuits.";
    } else {
        using BuilderType = typename TestFixture::BuilderType;
        using FF = typename TestFixture::FF;
        using Proof = typename TestFixture::Proof;
        using Verifier = typename TestFixture::Verifier;

        auto op_queue = make_op_queue_with_n_subtables(5);
        BatchMergeProver prover{ op_queue, TestFixture::NumSubtables };
        auto native_proof = prover.construct_proof();
        const bb::fr native_hash = compute_running_hash(native_proof, op_queue->num_subtables());

        BuilderType builder;
        Proof proof = TestFixture::create_proof(builder, native_proof);
        FF hash = TestFixture::create_hash(builder, native_hash);
        // The hash is consumed only via split_challenge, which yields a low/high pair via a single arithmetic
        // gate: hash = lo + 2^127 * hi. The verifier subsequently uses only the low half, so hash itself
        // appears in only that one gate. Pin it so the StaticAnalyzer doesn't flag it as unconstrained.
        hash.fix_witness();

        Verifier verifier;
        auto result = verifier.reduce_to_pairing_check(proof, hash);

        // The pairing points are public outputs from the recursive verifier that will be verified externally via a
        // pairing check. Their output coordinates may not appear in multiple constraint gates; fix_witness() pins
        // them so the StaticAnalyzer doesn't flag the coordinate limbs as unconstrained.
        result.pairing_points.fix_witness();

        builder.finalize_circuit();

        using Analyzer =
            std::conditional_t<IsMegaBuilder<BuilderType>, cdg::MegaStaticAnalyzer, cdg::UltraStaticAnalyzer>;
        auto graph = Analyzer(builder);
        auto [cc, variables_in_one_gate] = graph.analyze_circuit(/*filter_cc=*/true);

        EXPECT_EQ(cc.size(), 1);
        EXPECT_EQ(variables_in_one_gate.size(), 0);
    }
}

} // namespace bb
