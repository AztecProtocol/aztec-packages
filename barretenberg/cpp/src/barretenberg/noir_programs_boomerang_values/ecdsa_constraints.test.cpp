/**
 * @file ecdsa_constraints.test.cpp
 * @brief Tests for ECDSA constraint validation in the static analyzer
 *
 * @note CircuitChecker::check is intentionally omitted from these tests.
 *       ECDSA circuits are large (~10K+ gates) and CircuitChecker accounts for ~70% of test runtime.
 *       Circuit correctness is already validated by the DSL ECDSA tests (dsl/acir_format/ecdsa_constraints.test.cpp).
 */
#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/helpers.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::crypto;
using namespace acir_format;
using namespace cdg;

class EcdsaConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

namespace {

template <typename... Constraints>
AcirFormat build_acir_format(uint32_t max_witness_index, const Constraints&... constraints)
{
    std::vector<Acir::Opcode> opcodes;
    auto collect = [&opcodes](const auto& constraint) {
        auto ops = constraint_to_acir_opcode(constraint);
        opcodes.insert(opcodes.end(), ops.begin(), ops.end());
    };
    (collect(constraints), ...);
    (void)max_witness_index;
    return circuit_serde_to_acir_format(build_acir_circuit(opcodes));
}

// Reproducible test key
template <typename Curve> struct EcdsaTestData {
    using FrNative = typename Curve::fr;
    using FqNative = typename Curve::fq;
    using G1Native = typename Curve::g1;

    static constexpr FrNative private_key =
        FrNative("0xd67abee717b3fc725adf59e2cc8cd916435c348b277dd814a34e3ceb279436c2");

    static EcdsaConstraint generate_valid_constraint(bool predicate_is_witness)
    {
        std::string message_string = "Instructions unclear, ask again later.";
        std::vector<uint8_t> message_buffer(message_string.begin(), message_string.end());
        std::array<uint8_t, 32> hashed_message = Sha256Hasher::hash(message_buffer);

        ecdsa_key_pair<FrNative, G1Native> account;
        account.private_key = private_key;
        account.public_key = G1Native::one * account.private_key;

        ecdsa_signature signature =
            ecdsa_construct_signature<Sha256Hasher, FqNative, FrNative, G1Native>(message_string, account);

        std::array<uint8_t, 32> buffer_x;
        std::array<uint8_t, 32> buffer_y;
        FqNative::serialize_to_buffer(account.public_key.x, &buffer_x[0]);
        FqNative::serialize_to_buffer(account.public_key.y, &buffer_y[0]);

        WitnessVector witness_values;

        auto hashed_message_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(hashed_message));
        auto pub_x_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(buffer_x));
        auto pub_y_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(buffer_y));
        auto r_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(signature.r));
        auto s_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(signature.s));
        uint32_t result_index = add_to_witness_and_track_indices(witness_values, bb::fr(1));

        std::array<uint32_t, 64> signature_indices;
        std::ranges::copy(r_indices, signature_indices.begin());
        std::ranges::copy(s_indices, signature_indices.begin() + 32);

        WitnessOrConstant<bb::fr> predicate;
        if (predicate_is_witness) {
            uint32_t predicate_index = add_to_witness_and_track_indices(witness_values, bb::fr(1));
            predicate = WitnessOrConstant<bb::fr>::from_index(predicate_index);
        } else {
            predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr(1));
        }

        return { .type = Curve::type,
                 .hashed_message = hashed_message_indices,
                 .signature = signature_indices,
                 .pub_x_indices = pub_x_indices,
                 .pub_y_indices = pub_y_indices,
                 .predicate = predicate,
                 .result = result_index };
    }

    /**
     * @brief Generate two valid ECDSA constraints that share the same predicate witness
     * @details Both constraints use the same key but sign different messages. The shared predicate
     *          means !predicate participates in AND gates from both constraints' conditional_assign
     *          chains, testing whether find_and_unknown_rhs can disambiguate.
     */
    static std::pair<EcdsaConstraint, EcdsaConstraint> generate_two_constraints_shared_predicate()
    {
        ecdsa_key_pair<FrNative, G1Native> account;
        account.private_key = private_key;
        account.public_key = G1Native::one * account.private_key;

        std::array<uint8_t, 32> buffer_x;
        std::array<uint8_t, 32> buffer_y;
        FqNative::serialize_to_buffer(account.public_key.x, &buffer_x[0]);
        FqNative::serialize_to_buffer(account.public_key.y, &buffer_y[0]);

        WitnessVector witness_values;

        // Shared predicate witness (added first so both constraints reference it)
        uint32_t predicate_index = add_to_witness_and_track_indices(witness_values, bb::fr(1));
        auto predicate = WitnessOrConstant<bb::fr>::from_index(predicate_index);

        // --- Constraint 1 ---
        std::string msg1 = "Instructions unclear, ask again later.";
        std::array<uint8_t, 32> hash1 = Sha256Hasher::hash(std::vector<uint8_t>(msg1.begin(), msg1.end()));
        ecdsa_signature sig1 = ecdsa_construct_signature<Sha256Hasher, FqNative, FrNative, G1Native>(msg1, account);

        auto hash1_indices = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(hash1));
        auto pub_x1 = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(buffer_x));
        auto pub_y1 = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(buffer_y));
        auto r1 = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(sig1.r));
        auto s1 = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(sig1.s));
        uint32_t result1 = add_to_witness_and_track_indices(witness_values, bb::fr(1));

        std::array<uint32_t, 64> sig1_indices;
        std::ranges::copy(r1, sig1_indices.begin());
        std::ranges::copy(s1, sig1_indices.begin() + 32);

        EcdsaConstraint ecdsa1 = { .type = Curve::type,
                                   .hashed_message = hash1_indices,
                                   .signature = sig1_indices,
                                   .pub_x_indices = pub_x1,
                                   .pub_y_indices = pub_y1,
                                   .predicate = predicate,
                                   .result = result1 };

        // --- Constraint 2 (different message, same key, same predicate) ---
        std::string msg2 = "A completely different message for the second ECDSA constraint.";
        std::array<uint8_t, 32> hash2 = Sha256Hasher::hash(std::vector<uint8_t>(msg2.begin(), msg2.end()));
        ecdsa_signature sig2 = ecdsa_construct_signature<Sha256Hasher, FqNative, FrNative, G1Native>(msg2, account);

        auto hash2_indices = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(hash2));
        auto pub_x2 = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(buffer_x));
        auto pub_y2 = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(buffer_y));
        auto r2 = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(sig2.r));
        auto s2 = add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(sig2.s));
        uint32_t result2 = add_to_witness_and_track_indices(witness_values, bb::fr(1));

        std::array<uint32_t, 64> sig2_indices;
        std::ranges::copy(r2, sig2_indices.begin());
        std::ranges::copy(s2, sig2_indices.begin() + 32);

        EcdsaConstraint ecdsa2 = { .type = Curve::type,
                                   .hashed_message = hash2_indices,
                                   .signature = sig2_indices,
                                   .pub_x_indices = pub_x2,
                                   .pub_y_indices = pub_y2,
                                   .predicate = predicate,
                                   .result = result2 };

        return { ecdsa1, ecdsa2 };
    }
};

using K1Curve = bb::stdlib::secp256k1<UltraCircuitBuilder>;
using R1Curve = bb::stdlib::secp256r1<UltraCircuitBuilder>;

} // namespace

TEST_F(EcdsaConstraintsTests, ValidateEcdsaK1Constraint)
{
    auto ecdsa_constraint = EcdsaTestData<K1Curve>::generate_valid_constraint(/*predicate_is_witness=*/true);
    AcirFormat constraint_system = build_acir_format(0, ecdsa_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcdsaConstraintsTests, ValidateEcdsaR1Constraint)
{
    auto ecdsa_constraint = EcdsaTestData<R1Curve>::generate_valid_constraint(/*predicate_is_witness=*/true);
    AcirFormat constraint_system = build_acir_format(0, ecdsa_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcdsaConstraintsTests, ValidateEcdsaK1ConstantPredicate)
{
    auto ecdsa_constraint = EcdsaTestData<K1Curve>::generate_valid_constraint(/*predicate_is_witness=*/false);
    AcirFormat constraint_system = build_acir_format(0, ecdsa_constraint);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcdsaConstraintsTests, DetectCorruptedBooleanConstraint)
{
    auto ecdsa_constraint = EcdsaTestData<K1Curve>::generate_valid_constraint(/*predicate_is_witness=*/true);
    AcirFormat constraint_system = build_acir_format(0, ecdsa_constraint);

    auto program = AcirProgram{ constraint_system, {} };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt: disable all boolean gates by zeroing q_arith in arithmetic block
    // This removes the boolean constraint on result
    auto& q_arith = builder.blocks.arithmetic.q_arith();
    auto& q_m = builder.blocks.arithmetic.q_m();
    auto& q_1 = builder.blocks.arithmetic.q_1();
    uint32_t result_idx = ecdsa_constraint.result;

    // Find and corrupt the specific boolean gate for result
    bool corrupted = false;
    for (size_t i = 0; i < q_arith.size(); ++i) {
        auto w_l = builder.blocks.arithmetic.w_l()[i];
        // Boolean gate: q_m=1, q_1=-1, w_l=result_idx
        if (w_l == result_idx && q_m[i] == fr::one() && q_1[i] == fr(-1) && q_arith[i] == fr::one()) {
            q_arith.set(i, fr::zero());
            corrupted = true;
            break;
        }
    }
    ASSERT_TRUE(corrupted) << "Could not find boolean gate for result witness";

    AcirFormat constraint_system_copy = constraint_system;
    StaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcdsaConstraintsTests, DetectCorruptedRangeConstraint)
{
    auto ecdsa_constraint = EcdsaTestData<K1Curve>::generate_valid_constraint(/*predicate_is_witness=*/true);
    AcirFormat constraint_system = build_acir_format(0, ecdsa_constraint);

    auto program = AcirProgram{ constraint_system, {} };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt: clear the 8-bit range list (range_lists[255])
    // This removes all byte range constraints
    auto it = builder.range_lists.find(255);
    ASSERT_NE(it, builder.range_lists.end()) << "No 8-bit range list found";
    it->second.variable_indices.clear();

    AcirFormat constraint_system_copy = constraint_system;
    StaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(EcdsaConstraintsTests, DetectCorruptedConditionalAssign)
{
    auto ecdsa_constraint = EcdsaTestData<K1Curve>::generate_valid_constraint(/*predicate_is_witness=*/true);
    AcirFormat constraint_system = build_acir_format(0, ecdsa_constraint);

    auto program = AcirProgram{ constraint_system, {} };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt: disable all arithmetic gates to break conditional_assign patterns
    auto& q_arith = builder.blocks.arithmetic.q_arith();
    for (size_t i = 0; i < q_arith.size(); ++i) {
        q_arith.set(i, fr::zero());
    }

    AcirFormat constraint_system_copy = constraint_system;
    StaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    analyzer.process_constraint_system();
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

// Regression test: two ECDSA constraints sharing the same predicate witness create multiple
// AND gates on !predicate (one per constraint's bool_t::conditional_assign chain).
// find_and_unknown_rhs must not match the wrong constraint's gate when tracing
// the !predicate && signature_result pattern.
TEST_F(EcdsaConstraintsTests, TwoConstraintsSharedPredicateDoNotInterfere)
{
    auto [ecdsa1, ecdsa2] = EcdsaTestData<K1Curve>::generate_two_constraints_shared_predicate();
    AcirFormat constraint_system = build_acir_format(0, ecdsa1, ecdsa2);

    StaticAnalyzerAcir analyzer(std::move(constraint_system));
    analyzer.process_constraint_system();
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty())
        << "Analyzer should validate both ECDSA constraints when they share a predicate witness";
}
