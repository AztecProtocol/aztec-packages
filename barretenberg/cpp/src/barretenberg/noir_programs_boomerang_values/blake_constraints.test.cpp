/**
 * @file blake_constraints.test.cpp
 * @brief Tests for blake2s and blake3 constraint validation in the static analyzer
 */
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/blake2s_constraint.hpp"
#include "barretenberg/dsl/acir_format/blake3_constraint.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace acir_format;
using namespace cdg;

namespace {

struct Blake2sTraits {
    using Constraint = Blake2sConstraint;
    static auto compute_hash(const std::vector<uint8_t>& input) { return crypto::blake2s(input); }
    static auto& get_constraints(AcirFormat& cs) { return cs.blake2s_constraints; }
};

struct Blake3Traits {
    using Constraint = Blake3Constraint;
    static auto compute_hash(const std::vector<uint8_t>& input) { return blake3::blake3s(input); }
    static auto& get_constraints(AcirFormat& cs) { return cs.blake3_constraints; }
};

/**
 * @brief Generate a valid blake constraint with correct witness values
 * @return Pair of (constraint, witness_values)
 */
template <typename Traits> std::pair<typename Traits::Constraint, WitnessVector> generate_valid_blake_constraint()
{
    typename Traits::Constraint blake_constraint;
    WitnessVector witness_values;

    // Input: 64-byte message
    std::vector<uint8_t> input_state(64);
    for (size_t i = 0; i < input_state.size(); ++i) {
        input_state[i] = static_cast<uint8_t>(i % 256);
    }

    // Compute expected output using native hash
    auto output_state = Traits::compute_hash(input_state);

    // Add input bytes as witnesses
    auto input_indices = add_to_witness_and_track_indices(witness_values, input_state);
    for (const auto& idx : input_indices) {
        blake_constraint.inputs.push_back(WitnessOrConstant<bb::fr>::from_index(idx));
    }

    // Add output bytes as witnesses
    auto output_indices = add_to_witness_and_track_indices<decltype(output_state), 32>(witness_values, output_state);
    blake_constraint.result = output_indices;

    return { blake_constraint, witness_values };
}

/**
 * @brief Generate a blake constraint where specified input bytes are constants instead of witnesses
 * @param constant_indices Set of input byte indices to make constant
 */
template <typename Traits>
std::pair<typename Traits::Constraint, WitnessVector> generate_blake_constraint_with_constants(
    const std::unordered_set<size_t>& constant_indices)
{
    typename Traits::Constraint blake_constraint;
    WitnessVector witness_values;

    // Input: 64-byte message
    std::vector<uint8_t> input_state(64);
    for (size_t i = 0; i < input_state.size(); ++i) {
        input_state[i] = static_cast<uint8_t>(i % 256);
    }

    // Compute expected output using native hash
    auto output_state = Traits::compute_hash(input_state);

    // Add output bytes as witnesses first (outputs are always witnesses)
    auto output_indices = add_to_witness_and_track_indices<decltype(output_state), 32>(witness_values, output_state);
    blake_constraint.result = output_indices;

    // Add input bytes - either as constants or witnesses
    for (size_t i = 0; i < input_state.size(); ++i) {
        if (constant_indices.count(i) > 0) {
            blake_constraint.inputs.push_back(WitnessOrConstant<bb::fr>::from_constant(bb::fr(input_state[i])));
        } else {
            witness_values.emplace_back(bb::fr(input_state[i]));
            blake_constraint.inputs.push_back(
                WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(witness_values.size() - 1)));
        }
    }

    return { blake_constraint, witness_values };
}

} // namespace

template <typename Traits> class BlakeConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BlakeTestTypes = ::testing::Types<Blake2sTraits, Blake3Traits>;
TYPED_TEST_SUITE(BlakeConstraintsTests, BlakeTestTypes);

/**
 * @brief Test that the analyzer validates a correct blake constraint
 */
TYPED_TEST(BlakeConstraintsTests, Valid)
{
    auto [blake_constraint, witness_values] = generate_valid_blake_constraint<TypeParam>();

    auto constraint_system = constraint_to_acir_format(blake_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer validates a correct blake constraint with MegaCircuitBuilder
 */
TYPED_TEST(BlakeConstraintsTests, ValidMega)
{
    auto [blake_constraint, witness_values] = generate_valid_blake_constraint<TypeParam>();

    auto constraint_system = constraint_to_acir_format(blake_constraint);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer detects when a blake result is corrupted after circuit construction.
 */
TYPED_TEST(BlakeConstraintsTests, DetectCorruptedOutputConnection)
{
    auto [blake_constraint, witness_values] = generate_valid_blake_constraint<TypeParam>();

    auto constraint_system = constraint_to_acir_format(blake_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt the constraint AFTER the circuit is built
    auto& constraints = TypeParam::get_constraints(constraint_system);
    std::swap(constraints[0].result[0], constraints[0].result[1]);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer detects corrupted blake result (Mega builder)
 */
TYPED_TEST(BlakeConstraintsTests, DetectCorruptedOutputConnectionMega)
{
    auto [blake_constraint, witness_values] = generate_valid_blake_constraint<TypeParam>();

    auto constraint_system = constraint_to_acir_format(blake_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    auto& constraints = TypeParam::get_constraints(constraint_system);
    std::swap(constraints[0].result[0], constraints[0].result[1]);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system), std::move(builder));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer detects when input byte range constraints are missing.
 * @details Build a valid circuit, then clear range_lists[255] so the 8-bit range check
 * on input bytes fails. This exercises the is_range_constrained_via_limb_lookup path.
 */
TYPED_TEST(BlakeConstraintsTests, DetectMissingInputRangeConstraint)
{
    auto [blake_constraint, witness_values] = generate_valid_blake_constraint<TypeParam>();

    auto constraint_system = constraint_to_acir_format(blake_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt: remove all 8-bit range constraints
    builder.range_lists.erase(255);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Test blake with some constant input bytes
 */
TYPED_TEST(BlakeConstraintsTests, ValidWithConstantInputs)
{
    auto [blake_constraint, witness_values] = generate_blake_constraint_with_constants<TypeParam>({ 0, 1, 2, 3, 4 });

    auto constraint_system = constraint_to_acir_format(blake_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test blake with a single constant input byte (Mega builder)
 */
TYPED_TEST(BlakeConstraintsTests, ValidWithSingleConstantMega)
{
    auto [blake_constraint, witness_values] = generate_blake_constraint_with_constants<TypeParam>({ 12 });

    auto constraint_system = constraint_to_acir_format(blake_constraint);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}
