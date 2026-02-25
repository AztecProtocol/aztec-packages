/**
 * @file blake3_constraints.test.cpp
 * @brief Tests for blake3 constraint validation in the static analyzer
 */
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/blake3_constraint.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace acir_format;
using namespace cdg;

class Blake3ConstraintsTests : public ::testing::Test {
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

/**
 * @brief Generate a valid Blake3Constraint with correct witness values
 * @return Pair of (constraint, witness_values)
 */
std::pair<Blake3Constraint, WitnessVector> generate_valid_blake3_constraint()
{
    Blake3Constraint blake3_constraint;
    WitnessVector witness_values;

    // Input: 64-byte message
    std::vector<uint8_t> input_state(64);
    for (size_t i = 0; i < input_state.size(); ++i) {
        input_state[i] = static_cast<uint8_t>(i % 256);
    }

    // Compute expected output using native blake3
    std::vector<uint8_t> output_state = blake3::blake3s(input_state);

    // Add input bytes as witnesses
    auto input_indices = add_to_witness_and_track_indices(witness_values, input_state);
    for (const auto& idx : input_indices) {
        blake3_constraint.inputs.push_back(WitnessOrConstant<bb::fr>::from_index(idx));
    }

    // Add output bytes as witnesses
    auto output_indices = add_to_witness_and_track_indices<decltype(output_state), 32>(witness_values, output_state);
    blake3_constraint.result = output_indices;

    return { blake3_constraint, witness_values };
}

/**
 * @brief Generate a blake3 constraint where specified input bytes are constants instead of witnesses
 * @param constant_indices Set of input byte indices to make constant
 */
std::pair<Blake3Constraint, WitnessVector> generate_blake3_constraint_with_constants(
    const std::unordered_set<size_t>& constant_indices)
{
    Blake3Constraint blake3_constraint;
    WitnessVector witness_values;

    // Input: 64-byte message
    std::vector<uint8_t> input_state(64);
    for (size_t i = 0; i < input_state.size(); ++i) {
        input_state[i] = static_cast<uint8_t>(i % 256);
    }

    // Compute expected output using native blake3
    std::vector<uint8_t> output_state = blake3::blake3s(input_state);

    // Add output bytes as witnesses first (outputs are always witnesses)
    auto output_indices = add_to_witness_and_track_indices<decltype(output_state), 32>(witness_values, output_state);
    blake3_constraint.result = output_indices;

    // Add input bytes - either as constants or witnesses
    for (size_t i = 0; i < input_state.size(); ++i) {
        if (constant_indices.count(i) > 0) {
            blake3_constraint.inputs.push_back(WitnessOrConstant<bb::fr>::from_constant(bb::fr(input_state[i])));
        } else {
            witness_values.emplace_back(bb::fr(input_state[i]));
            blake3_constraint.inputs.push_back(
                WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(witness_values.size() - 1)));
        }
    }

    return { blake3_constraint, witness_values };
}

} // namespace

/**
 * @brief Test that the analyzer validates a correct blake3 constraint
 */
TEST_F(Blake3ConstraintsTests, ValidBlake3)
{
    auto [blake3_constraint, witness_values] = generate_valid_blake3_constraint();

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), blake3_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer validates a correct blake3 constraint with MegaCircuitBuilder
 */
TEST_F(Blake3ConstraintsTests, ValidBlake3Mega)
{
    auto [blake3_constraint, witness_values] = generate_valid_blake3_constraint();

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), blake3_constraint);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer detects when a blake3 result is corrupted after circuit construction.
 */
TEST_F(Blake3ConstraintsTests, DetectCorruptedOutputConnection)
{
    auto [blake3_constraint, witness_values] = generate_valid_blake3_constraint();

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), blake3_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt the constraint AFTER the circuit is built
    std::swap(constraint_system.blake3_constraints[0].result[0], constraint_system.blake3_constraints[0].result[1]);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer detects corrupted blake3 result (Mega builder)
 */
TEST_F(Blake3ConstraintsTests, DetectCorruptedOutputConnectionMega)
{
    auto [blake3_constraint, witness_values] = generate_valid_blake3_constraint();

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), blake3_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    std::swap(constraint_system.blake3_constraints[0].result[0], constraint_system.blake3_constraints[0].result[1]);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system), std::move(builder));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Test blake3 with some constant input bytes
 */
TEST_F(Blake3ConstraintsTests, ValidBlake3WithConstantInputs)
{
    auto [blake3_constraint, witness_values] = generate_blake3_constraint_with_constants({ 0, 1, 2, 3, 4 });

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), blake3_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test blake3 with a single constant input byte (Mega builder)
 */
TEST_F(Blake3ConstraintsTests, ValidBlake3WithSingleConstantMega)
{
    auto [blake3_constraint, witness_values] = generate_blake3_constraint_with_constants({ 12 });

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), blake3_constraint);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}
