/**
 * @file aes_constraints.test.cpp
 * @brief Tests for AES128 constraint validation in the static analyzer.
 */
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/aes128_constraint.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace acir_format;
using namespace cdg;

namespace {

/**
 * @brief Generate an AES128 constraint with configurable constant parts.
 * @param num_blocks Number of 16-byte plaintext blocks.
 * @param constant_input_indices Set of plaintext byte indices to make constant.
 * @param constant_key If true, key bytes are constants instead of witnesses.
 * @param constant_iv If true, IV bytes are constants instead of witnesses.
 */
std::pair<AES128Constraint, WitnessVector> generate_aes_constraint(
    size_t num_blocks = 1,
    const std::unordered_set<size_t>& constant_input_indices = {},
    bool constant_key = false,
    bool constant_iv = false)
{
    AES128Constraint aes_constraint;
    WitnessVector witness_values;

    // Deterministic test vectors
    std::vector<uint8_t> plaintext(num_blocks * 16);
    for (size_t i = 0; i < plaintext.size(); ++i) {
        plaintext[i] = static_cast<uint8_t>((i * 7 + 13) % 256);
    }
    std::array<uint8_t, 16> key{};
    for (size_t i = 0; i < 16; ++i) {
        key[i] = static_cast<uint8_t>((i * 11 + 3) % 256);
    }
    std::array<uint8_t, 16> iv{};
    for (size_t i = 0; i < 16; ++i) {
        iv[i] = static_cast<uint8_t>((i * 5 + 7) % 256);
    }

    // Native encryption
    std::vector<uint8_t> buffer = plaintext;
    std::array<uint8_t, 16> iv_copy = iv;
    crypto::aes128_encrypt_buffer_cbc(buffer.data(), iv_copy.data(), key.data(), buffer.size());

    // Helper: add a byte as witness or constant
    auto add_byte = [&](uint8_t byte_val, bool is_constant) -> WitnessOrConstant<fr> {
        if (is_constant) {
            return WitnessOrConstant<fr>::from_constant(fr(byte_val));
        }
        witness_values.emplace_back(fr(byte_val));
        return WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness_values.size() - 1));
    };

    // Outputs first (so witness indices are stable when some inputs are constants)
    for (const auto& byte : buffer) {
        witness_values.emplace_back(fr(byte));
        aes_constraint.outputs.push_back(static_cast<uint32_t>(witness_values.size() - 1));
    }

    // Plaintext
    for (size_t i = 0; i < plaintext.size(); ++i) {
        aes_constraint.inputs.push_back(add_byte(plaintext[i], constant_input_indices.contains(i)));
    }

    // Key and IV
    for (size_t i = 0; i < 16; ++i) {
        aes_constraint.key[i] = add_byte(key[i], constant_key);
    }
    for (size_t i = 0; i < 16; ++i) {
        aes_constraint.iv[i] = add_byte(iv[i], constant_iv);
    }

    return { aes_constraint, witness_values };
}

} // namespace

class AESConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(AESConstraintsTests, Valid)
{
    auto [aes_constraint, witness_values] = generate_aes_constraint();
    auto constraint_system = constraint_to_acir_format(aes_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(AESConstraintsTests, ValidMega)
{
    auto [aes_constraint, witness_values] = generate_aes_constraint();
    auto constraint_system = constraint_to_acir_format(aes_constraint);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(AESConstraintsTests, ValidMultiBlock)
{
    auto [aes_constraint, witness_values] = generate_aes_constraint(/*num_blocks=*/2);
    auto constraint_system = constraint_to_acir_format(aes_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(AESConstraintsTests, DetectCorruptedOutputConnection)
{
    auto [aes_constraint, witness_values] = generate_aes_constraint();
    auto constraint_system = constraint_to_acir_format(aes_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt: swap two output indices after circuit was built
    std::swap(constraint_system.aes128_constraints[0].outputs[0], constraint_system.aes128_constraints[0].outputs[1]);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(AESConstraintsTests, DetectCorruptedOutputConnectionMega)
{
    auto [aes_constraint, witness_values] = generate_aes_constraint();
    auto constraint_system = constraint_to_acir_format(aes_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<MegaCircuitBuilder>(program);

    std::swap(constraint_system.aes128_constraints[0].outputs[0], constraint_system.aes128_constraints[0].outputs[1]);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system), std::move(builder));
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief Clears range_lists[255] so the 8-bit range check fails.
 * CircuitChecker cannot detect this (range_lists is metadata, not a gate).
 */
TEST_F(AESConstraintsTests, DetectMissingInputRangeConstraint)
{
    auto [aes_constraint, witness_values] = generate_aes_constraint();
    auto constraint_system = constraint_to_acir_format(aes_constraint);
    AcirProgram program{ constraint_system };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    builder.range_lists.erase(255);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(AESConstraintsTests, ValidWithConstantInputs)
{
    auto [aes_constraint, witness_values] = generate_aes_constraint(1, { 0, 1, 2, 3, 4 });
    auto constraint_system = constraint_to_acir_format(aes_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(AESConstraintsTests, ValidWithConstantKeyIV)
{
    auto [aes_constraint, witness_values] =
        generate_aes_constraint(1, /*constant_input_indices=*/{}, /*constant_key=*/true, /*constant_iv=*/true);
    auto constraint_system = constraint_to_acir_format(aes_constraint);

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(AESConstraintsTests, ValidWithConstantKeyIVMega)
{
    auto [aes_constraint, witness_values] = generate_aes_constraint(1, {}, true, true);
    auto constraint_system = constraint_to_acir_format(aes_constraint);

    auto analyzer = StaticAnalyzerAcirMega(std::move(constraint_system));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}
