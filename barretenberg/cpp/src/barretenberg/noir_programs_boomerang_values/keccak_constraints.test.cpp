/**
 * @file keccak_constraints.test.cpp
 * @brief Tests for keccak permutation constraint validation in the static analyzer
 */
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/crypto/keccak/keccakf1600.cpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/keccak_constraint.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace acir_format;
using namespace cdg;

class KeccakConstraintsTests : public ::testing::Test {
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
 * @brief Generate a valid Keccakf1600 constraint with correct witness values
 * @return Pair of (constraint, witness_values)
 */
std::pair<Keccakf1600, WitnessVector> generate_valid_keccak_constraint()
{
    Keccakf1600 keccak_constraint;
    WitnessVector witness_values;

    // Use a reproducible input state
    std::array<uint64_t, KECCAKF1600_LANES> input_state{};
    for (size_t i = 0; i < input_state.size(); ++i) {
        input_state[i] = static_cast<uint64_t>(i);
    }

    // Compute expected output state using native Keccak-f[1600] permutation
    std::array<uint64_t, KECCAKF1600_LANES> output_state = input_state;
    ethash_keccakf1600(output_state.data());

    // Add input/output states to witness
    auto input_indices = add_to_witness_and_track_indices<std::array<uint64_t, KECCAKF1600_LANES>, KECCAKF1600_LANES>(
        witness_values, input_state);
    auto output_indices = add_to_witness_and_track_indices<std::array<uint64_t, KECCAKF1600_LANES>, KECCAKF1600_LANES>(
        witness_values, output_state);

    for (size_t i = 0; i < KECCAKF1600_LANES; ++i) {
        keccak_constraint.state[i] = WitnessOrConstant<bb::fr>::from_index(input_indices[i]);
        keccak_constraint.result[i] = output_indices[i];
    }

    return { keccak_constraint, witness_values };
}

/**
 * @brief Generate a keccak constraint where specified lanes are constants instead of witnesses
 * @param constant_lanes Set of lane indices (0-24) to make constant
 */
std::pair<Keccakf1600, WitnessVector> generate_keccak_constraint_with_constants(
    const std::unordered_set<size_t>& constant_lanes)
{
    Keccakf1600 keccak_constraint;
    WitnessVector witness_values;

    std::array<uint64_t, KECCAKF1600_LANES> input_state{};
    for (size_t i = 0; i < input_state.size(); ++i) {
        input_state[i] = static_cast<uint64_t>(i);
    }

    std::array<uint64_t, KECCAKF1600_LANES> output_state = input_state;
    ethash_keccakf1600(output_state.data());

    // Add output state to witness (outputs are always witnesses)
    auto output_indices = add_to_witness_and_track_indices<std::array<uint64_t, KECCAKF1600_LANES>, KECCAKF1600_LANES>(
        witness_values, output_state);

    for (size_t i = 0; i < KECCAKF1600_LANES; ++i) {
        if (constant_lanes.count(i) > 0) {
            keccak_constraint.state[i] = WitnessOrConstant<bb::fr>::from_constant(bb::fr(input_state[i]));
        } else {
            witness_values.emplace_back(bb::fr(input_state[i]));
            keccak_constraint.state[i] =
                WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(witness_values.size() - 1));
        }
        keccak_constraint.result[i] = output_indices[i];
    }

    return { keccak_constraint, witness_values };
}

} // namespace

/**
 * @brief Test that the analyzer validates a correct keccak permutation constraint
 */
TEST_F(KeccakConstraintsTests, ValidKeccakPermutation)
{
    auto [keccak_constraint, witness_values] = generate_valid_keccak_constraint();

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), keccak_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer validates a correct keccak constraint with MegaCircuitBuilder
 */
TEST_F(KeccakConstraintsTests, ValidKeccakPermutationMega)
{
    auto [keccak_constraint, witness_values] = generate_valid_keccak_constraint();

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), keccak_constraint);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer detects when a keccak result is corrupted after circuit construction.
 * @details Build a valid circuit first, then swap result indices in the AcirFormat so that the
 *          assert_equal connections no longer match the keccak opcode_io mapping.
 */
TEST_F(KeccakConstraintsTests, DetectCorruptedOutputConnection)
{
    auto [keccak_constraint, witness_values] = generate_valid_keccak_constraint();

    // Build AcirFormat and circuit with the valid constraint
    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), keccak_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt the constraint AFTER the circuit is built
    std::swap(constraint_system.keccak_permutations[0].result[0], constraint_system.keccak_permutations[0].result[1]);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Test that the analyzer detects corrupted keccak result (Mega builder)
 */
TEST_F(KeccakConstraintsTests, DetectCorruptedOutputConnectionMega)
{
    auto [keccak_constraint, witness_values] = generate_valid_keccak_constraint();

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), keccak_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    std::swap(constraint_system.keccak_permutations[0].result[0], constraint_system.keccak_permutations[0].result[1]);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system), std::move(builder));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Test keccak permutation with some constant input lanes
 * @details Makes the first 5 lanes constant. After keccak mixing, all outputs are still witnesses.
 */
TEST_F(KeccakConstraintsTests, ValidKeccakPermutationWithConstantInputs)
{
    auto [keccak_constraint, witness_values] = generate_keccak_constraint_with_constants({ 0, 1, 2, 3, 4 });

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), keccak_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test keccak permutation with a single constant input lane (Mega builder)
 */
TEST_F(KeccakConstraintsTests, ValidKeccakPermutationWithSingleConstantMega)
{
    auto [keccak_constraint, witness_values] = generate_keccak_constraint_with_constants({ 12 });

    auto constraint_system = build_acir_format(static_cast<uint32_t>(witness_values.size() - 1), keccak_constraint);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system));
    auto incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}
