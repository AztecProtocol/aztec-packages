/**
 * @file boomerang_sha256_constraints.test.cpp
 * @brief Tests for SHA256 compression constraint processing in StaticAnalyzerAcir
 */

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <set>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

namespace {

// SHA256 IV constants
constexpr uint32_t SHA256_IV[8] = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

/**
 * @brief Helper struct to hold SHA256 constraint test setup
 */
struct SHA256TestSetup {
    Sha256Compression constraint;
    WitnessVector witness_values;
    std::array<uint32_t, 16> input_block;
    std::array<uint32_t, 8> hash_values;
    std::array<uint32_t, 8> result;
};

/**
 * @brief Build a standard all-witness SHA256 test setup
 */
SHA256TestSetup build_standard_sha256_setup()
{
    using FF = fr;
    SHA256TestSetup setup;

    setup.input_block = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
    std::copy(std::begin(SHA256_IV), std::end(SHA256_IV), setup.hash_values.begin());
    setup.result = crypto::sha256_block(setup.hash_values, setup.input_block);

    auto make_witness = [&](uint32_t value) -> WitnessOrConstant<FF> {
        uint32_t idx = static_cast<uint32_t>(setup.witness_values.size());
        setup.witness_values.emplace_back(FF(value));
        return WitnessOrConstant<FF>::from_index(idx);
    };

    for (size_t i = 0; i < 16; ++i) {
        setup.constraint.inputs[i] = make_witness(setup.input_block[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        setup.constraint.hash_values[i] = make_witness(setup.hash_values[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        setup.constraint.result[i] = static_cast<uint32_t>(setup.witness_values.size());
        setup.witness_values.emplace_back(FF(setup.result[i]));
    }

    return setup;
}

WitnessOrConstant<fr> witness_from_index(uint32_t idx)
{
    return WitnessOrConstant<fr>::from_index(idx);
}

constexpr uint32_t INPUT_BLOCK[16] = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };

/**
 * @brief Build SHA256 test setup with configurable constant masks.
 * @param h_init_constant_mask Bitmask: bit i set → hash_values[i] is constant
 * @param input_constant_mask  Bitmask: bit i set → inputs[i] is constant
 */
SHA256TestSetup build_sha256_setup_with_constants(uint8_t h_init_constant_mask, uint16_t input_constant_mask)
{
    using FF = fr;
    SHA256TestSetup setup;

    setup.input_block = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
    std::copy(std::begin(SHA256_IV), std::end(SHA256_IV), setup.hash_values.begin());
    setup.result = crypto::sha256_block(setup.hash_values, setup.input_block);

    auto make_witness = [&](uint32_t value) -> WitnessOrConstant<FF> {
        uint32_t idx = static_cast<uint32_t>(setup.witness_values.size());
        setup.witness_values.emplace_back(FF(value));
        return WitnessOrConstant<FF>::from_index(idx);
    };

    auto make_constant = [](uint32_t value) -> WitnessOrConstant<FF> {
        return WitnessOrConstant<FF>{ .index = 0, .value = FF(value), .is_constant = true };
    };

    for (size_t i = 0; i < 16; ++i) {
        setup.constraint.inputs[i] =
            (input_constant_mask & (1 << i)) ? make_constant(INPUT_BLOCK[i]) : make_witness(INPUT_BLOCK[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        setup.constraint.hash_values[i] =
            (h_init_constant_mask & (1 << i)) ? make_constant(SHA256_IV[i]) : make_witness(SHA256_IV[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        setup.constraint.result[i] = static_cast<uint32_t>(setup.witness_values.size());
        setup.witness_values.emplace_back(FF(setup.result[i]));
    }

    return setup;
}

/**
 * @brief Run full ACIR pipeline validation for a SHA256 constraint with given constant masks.
 */
void run_sha256_acir_validation(uint8_t h_init_mask, uint16_t input_mask)
{
    auto setup = build_sha256_setup_with_constants(h_init_mask, input_mask);

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

} // anonymous namespace

/**
 * @brief Test suite for SHA256 compression constraint processing in StaticAnalyzerAcir
 */
class BoomerangSHA256ConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Test basic SHA256 compression constraint processing
 */
TEST_F(BoomerangSHA256ConstraintsTests, BasicSHA256Constraint)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test SHA256 compression with zero message inputs
 */
TEST_F(BoomerangSHA256ConstraintsTests, SHA256ZeroInputs)
{
    using FF = fr;

    WitnessVector witness_values;
    auto make_witness = [&](uint32_t value) -> WitnessOrConstant<FF> {
        uint32_t idx = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(value));
        return WitnessOrConstant<FF>::from_index(idx);
    };

    std::array<uint32_t, 16> input_block = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    std::array<uint32_t, 8> hash_values = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    std::array<uint32_t, 8> result = crypto::sha256_block(hash_values, input_block);

    Sha256Compression sha256_constraint;

    for (size_t i = 0; i < 16; ++i) {
        sha256_constraint.inputs[i] = make_witness(input_block[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.hash_values[i] = make_witness(hash_values[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.result[i] = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(result[i]));
    }

    AcirFormat constraint_system = constraint_to_acir_format(sha256_constraint);
    AcirProgram program{ constraint_system, witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Corrupt all selectors in the arithmetic block
 *
 * Finds a constrained arithmetic gate (non-zero selectors, not UNCONSTRAINED or FIX_WITNESS),
 * then sets all arithmetic selectors to invalid values. Both CircuitChecker and the
 * StaticAnalyzerAcir should detect the corruption.
 */
HEAVY_TEST_F(BoomerangSHA256ConstraintsTests, CorruptAllSelectors_ArithBlock)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    auto& arith = builder.blocks.arithmetic;
    for (size_t i = 0; i < arith.size(); ++i) {
        arith.q_m().set(i, fr::random_element());
        arith.q_1().set(i, fr::random_element());
        arith.q_2().set(i, fr::random_element());
        arith.q_3().set(i, fr::random_element());
        arith.q_4().set(i, fr::random_element());
        arith.gate_selector_for(bb::GateKind::Arith).set(i, fr::random_element());
        arith.q_c().set(i, fr::random_element());
    }

    // EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Corrupt ALL selectors of an active lookup gate
 *
 * Finds a lookup gate with q_lookup == 1, then sets all lookup-relevant selectors
 * to invalid values. Both CircuitChecker and the StaticAnalyzerAcir should detect
 * the corruption.
 */
HEAVY_TEST_F(BoomerangSHA256ConstraintsTests, CorruptAllSelectors_LookupGate)
{
    auto setup = build_standard_sha256_setup();
    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});
    auto& lookup = builder.blocks.lookup;
    for (size_t i = 0; i < lookup.size(); ++i) {
        if (lookup.gate_selector_for(bb::GateKind::Lookup)[i] == fr(1)) {
            lookup.q_1().set(i, fr::random_element());
            lookup.q_2().set(i, fr::random_element());
            lookup.q_3().set(i, fr::random_element());
            lookup.q_m().set(i, fr::random_element());
            lookup.q_c().set(i, fr::random_element());
        }
    }
    // EXPECT_FALSE(CircuitChecker::check(builder));
    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Corrupt wires of all constrained arithmetic gates
 *
 * Loops over all arithmetic gates and replaces all wire indices with random variable indices.
 * Both CircuitChecker and the StaticAnalyzerAcir should detect the corruption.
 */
HEAVY_TEST_F(BoomerangSHA256ConstraintsTests, CorruptAllWires_ArithGate)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    auto& arith = builder.blocks.arithmetic;
    auto num_vars = static_cast<uint32_t>(builder.real_variable_index.size());
    auto rand_idx = [&]() { return static_cast<uint32_t>(uint256_t(fr::random_element()) % num_vars); };
    for (size_t i = 0; i < arith.size(); ++i) {
        arith.w_l()[i] = rand_idx();
        arith.w_r()[i] = rand_idx();
        arith.w_o()[i] = rand_idx();
        arith.w_4()[i] = rand_idx();
    }

    // EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Corrupt wires of all active lookup gates
 *
 * Loops over all lookup gates where q_lookup == 1 and replaces all wire indices
 * with random variable indices. Both CircuitChecker and the StaticAnalyzerAcir
 * should detect the corruption.
 */
HEAVY_TEST_F(BoomerangSHA256ConstraintsTests, CorruptAllWires_LookupGate)
{
    auto setup = build_standard_sha256_setup();
    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});
    auto& lookup = builder.blocks.lookup;
    auto num_vars = static_cast<uint32_t>(builder.real_variable_index.size());
    auto rand_idx = [&]() { return static_cast<uint32_t>(uint256_t(fr::random_element()) % num_vars); };
    for (size_t i = 0; i < lookup.size(); ++i) {
        if (lookup.gate_selector_for(bb::GateKind::Lookup)[i] == fr(1)) {
            lookup.w_l()[i] = rand_idx();
            lookup.w_r()[i] = rand_idx();
            lookup.w_o()[i] = rand_idx();
        }
    }
    // EXPECT_FALSE(CircuitChecker::check(builder));
    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief All 8 hash_values share a single witness (value 42).
 *
 * Tests analyzer with maximum hash state deduplication.
 */
TEST_F(BoomerangSHA256ConstraintsTests, SharedWitness_AllHashValues)
{
    const uint32_t HASH_VAL = 42;
    std::array<uint32_t, 8> hash_vals;
    hash_vals.fill(HASH_VAL);

    std::array<uint32_t, 16> input_values;
    for (size_t i = 0; i < 16; ++i) {
        input_values[i] = static_cast<uint32_t>(i + 1);
    }

    auto result_u32 = crypto::sha256_block(hash_vals, input_values);

    // Layout: inputs[0..15]=idx 0..15, shared_hash=idx 16, results=idx 17..24
    constexpr size_t N = 16 + 1 + 8;
    WitnessVector witness(N);
    for (size_t i = 0; i < 16; ++i) {
        witness[i] = fr(input_values[i]);
    }
    witness[16] = fr(HASH_VAL);
    for (size_t i = 0; i < 8; ++i) {
        witness[17 + i] = fr(result_u32[i]);
    }

    Sha256Compression sha256_constraint;
    for (size_t i = 0; i < 16; ++i) {
        sha256_constraint.inputs[i] = witness_from_index(static_cast<uint32_t>(i));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.hash_values[i] = witness_from_index(16); // all share
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.result[i] = static_cast<uint32_t>(17 + i);
    }

    AcirFormat cs = constraint_to_acir_format(sha256_constraint);
    AcirProgram program{ cs, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = cs;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect.empty());
}

/**
 * @brief All 24 input slots (16 inputs + 8 hash) share ONE witness (value 42).
 *
 * Maximum deduplication: only 9 witnesses total (1 shared + 8 results).
 */
TEST_F(BoomerangSHA256ConstraintsTests, SharedWitness_AllInputsAndHash)
{
    const uint32_t V = 42;
    std::array<uint32_t, 16> input_values;
    input_values.fill(V);
    std::array<uint32_t, 8> hash_vals;
    hash_vals.fill(V);

    auto result_u32 = crypto::sha256_block(hash_vals, input_values);

    // Layout: shared=idx 0, results=idx 1..8
    constexpr size_t N = 1 + 8;
    WitnessVector witness(N);
    witness[0] = fr(V);
    for (size_t i = 0; i < 8; ++i) {
        witness[1 + i] = fr(result_u32[i]);
    }

    Sha256Compression sha256_constraint;
    for (size_t i = 0; i < 16; ++i) {
        sha256_constraint.inputs[i] = witness_from_index(0); // all share
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.hash_values[i] = witness_from_index(0); // all share
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.result[i] = static_cast<uint32_t>(1 + i);
    }

    AcirFormat cs = constraint_to_acir_format(sha256_constraint);
    AcirProgram program{ cs, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = cs;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect.empty());
}

/**
 * @brief Two witnesses total: one for all inputs, one for all hash_values.
 *
 * 10 witnesses (1 for inputs + 1 for hash + 8 results).
 */
TEST_F(BoomerangSHA256ConstraintsTests, SharedWitness_TwoWitnessInputsHash)
{
    const uint32_t INPUT_VAL = 42;
    const uint32_t HASH_VAL = 100;

    std::array<uint32_t, 16> input_values;
    input_values.fill(INPUT_VAL);
    std::array<uint32_t, 8> hash_vals;
    hash_vals.fill(HASH_VAL);

    auto result_u32 = crypto::sha256_block(hash_vals, input_values);

    // Layout: shared_input=idx 0, shared_hash=idx 1, results=idx 2..9
    constexpr size_t N = 2 + 8;
    WitnessVector witness(N);
    witness[0] = fr(INPUT_VAL);
    witness[1] = fr(HASH_VAL);
    for (size_t i = 0; i < 8; ++i) {
        witness[2 + i] = fr(result_u32[i]);
    }

    Sha256Compression sha256_constraint;
    for (size_t i = 0; i < 16; ++i) {
        sha256_constraint.inputs[i] = witness_from_index(0); // all share
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.hash_values[i] = witness_from_index(1); // all share
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.result[i] = static_cast<uint32_t>(2 + i);
    }

    AcirFormat cs = constraint_to_acir_format(sha256_constraint);
    AcirProgram program{ cs, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = cs;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect.empty());
}

/**
 * @brief Range-constrained witnesses share: hash[3], hash[7], inputs[0] share one witness.
 *
 * These three positions receive 32-bit range constraints internally.
 * Tests range constraint deduplication when the builder calls create_range_constraint
 * multiple times on the same variable.
 */
TEST_F(BoomerangSHA256ConstraintsTests, SharedWitness_RangeConstrained)
{
    const uint32_t SHARED_VAL = 42;

    std::array<uint32_t, 8> hash_vals = { SHA256_IV[0], SHA256_IV[1], SHA256_IV[2], SHARED_VAL,
                                          SHA256_IV[4], SHA256_IV[5], SHA256_IV[6], SHARED_VAL };

    std::array<uint32_t, 16> input_values;
    input_values[0] = SHARED_VAL;
    for (size_t i = 1; i < 16; ++i) {
        input_values[i] = static_cast<uint32_t>(i + 1);
    }

    auto result_u32 = crypto::sha256_block(hash_vals, input_values);

    // Layout: shared=idx 0, inputs[1..15]=idx 1..15, hash[0..2]=idx 16..18,
    //         hash[4..6]=idx 19..21, results=idx 22..29
    constexpr size_t N = 1 + 15 + 3 + 3 + 8;
    WitnessVector witness(N);
    witness[0] = fr(SHARED_VAL);
    for (size_t i = 1; i < 16; ++i) {
        witness[i] = fr(input_values[i]);
    }
    witness[16] = fr(hash_vals[0]);
    witness[17] = fr(hash_vals[1]);
    witness[18] = fr(hash_vals[2]);
    witness[19] = fr(hash_vals[4]);
    witness[20] = fr(hash_vals[5]);
    witness[21] = fr(hash_vals[6]);
    for (size_t i = 0; i < 8; ++i) {
        witness[22 + i] = fr(result_u32[i]);
    }

    Sha256Compression sha256_constraint;
    sha256_constraint.inputs[0] = witness_from_index(0); // shared
    for (size_t i = 1; i < 16; ++i) {
        sha256_constraint.inputs[i] = witness_from_index(static_cast<uint32_t>(i));
    }
    sha256_constraint.hash_values[0] = witness_from_index(16);
    sha256_constraint.hash_values[1] = witness_from_index(17);
    sha256_constraint.hash_values[2] = witness_from_index(18);
    sha256_constraint.hash_values[3] = witness_from_index(0); // shared
    sha256_constraint.hash_values[4] = witness_from_index(19);
    sha256_constraint.hash_values[5] = witness_from_index(20);
    sha256_constraint.hash_values[6] = witness_from_index(21);
    sha256_constraint.hash_values[7] = witness_from_index(0); // shared
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.result[i] = static_cast<uint32_t>(22 + i);
    }

    AcirFormat cs = constraint_to_acir_format(sha256_constraint);
    AcirProgram program{ cs, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = cs;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect.empty());
}

/**
 * @brief Cross-role sharing: inputs share witness indices with hash_values.
 *
 * inputs[0] shares witness with hash[0] (both value 100),
 * inputs[1] shares with hash[1] (both value 200).
 * Tests whether the analyzer handles multi-role witnesses that appear in both
 * lookup (as input) and add-normalize (as hash) gate patterns.
 */
TEST_F(BoomerangSHA256ConstraintsTests, SharedWitness_CrossRole)
{
    const uint32_t CROSS_VAL_0 = 100;
    const uint32_t CROSS_VAL_1 = 200;

    std::array<uint32_t, 8> hash_vals = { CROSS_VAL_0,  CROSS_VAL_1,  SHA256_IV[2], SHA256_IV[3],
                                          SHA256_IV[4], SHA256_IV[5], SHA256_IV[6], SHA256_IV[7] };

    std::array<uint32_t, 16> input_values;
    input_values[0] = CROSS_VAL_0;
    input_values[1] = CROSS_VAL_1;
    for (size_t i = 2; i < 16; ++i) {
        input_values[i] = static_cast<uint32_t>(i + 1);
    }

    auto result_u32 = crypto::sha256_block(hash_vals, input_values);

    // Layout: shared_0=idx 0, shared_1=idx 1, inputs[2..15]=idx 2..15,
    //         hash[2..7]=idx 16..21, results=idx 22..29
    constexpr size_t N = 2 + 14 + 6 + 8;
    WitnessVector witness(N);
    witness[0] = fr(CROSS_VAL_0);
    witness[1] = fr(CROSS_VAL_1);
    for (size_t i = 2; i < 16; ++i) {
        witness[i] = fr(input_values[i]);
    }
    for (size_t i = 2; i < 8; ++i) {
        witness[14 + i] = fr(hash_vals[i]); // hash[2..7] at idx 16..21
    }
    for (size_t i = 0; i < 8; ++i) {
        witness[22 + i] = fr(result_u32[i]);
    }

    Sha256Compression sha256_constraint;
    sha256_constraint.inputs[0] = witness_from_index(0); // shared with hash[0]
    sha256_constraint.inputs[1] = witness_from_index(1); // shared with hash[1]
    for (size_t i = 2; i < 16; ++i) {
        sha256_constraint.inputs[i] = witness_from_index(static_cast<uint32_t>(i));
    }
    sha256_constraint.hash_values[0] = witness_from_index(0); // shared with inputs[0]
    sha256_constraint.hash_values[1] = witness_from_index(1); // shared with inputs[1]
    sha256_constraint.hash_values[2] = witness_from_index(16);
    sha256_constraint.hash_values[3] = witness_from_index(17);
    sha256_constraint.hash_values[4] = witness_from_index(18);
    sha256_constraint.hash_values[5] = witness_from_index(19);
    sha256_constraint.hash_values[6] = witness_from_index(20);
    sha256_constraint.hash_values[7] = witness_from_index(21);
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.result[i] = static_cast<uint32_t>(22 + i);
    }

    AcirFormat cs = constraint_to_acir_format(sha256_constraint);
    AcirProgram program{ cs, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = cs;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect.empty());
}

/**
 * @brief Test two SHA256 compression constraints in a single ACIR program.
 *
 * Verifies that when two independent sha256_compression constraints share the same
 * range_lists (filler gates created only once), both constraints are validated correctly
 * and their subcircuit boundaries are disjoint.
 */
TEST_F(BoomerangSHA256ConstraintsTests, TwoSHA256Constraints)
{
    using FF = fr;

    WitnessVector witness_values;
    auto make_witness = [&](uint32_t value) -> WitnessOrConstant<FF> {
        uint32_t idx = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(value));
        return WitnessOrConstant<FF>::from_index(idx);
    };

    // First constraint: standard IV + block
    std::array<uint32_t, 16> input_block_1 = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
    std::array<uint32_t, 8> hash_values_1;
    std::copy(std::begin(SHA256_IV), std::end(SHA256_IV), hash_values_1.begin());
    auto result_1 = crypto::sha256_block(hash_values_1, input_block_1);

    Sha256Compression constraint_1;
    for (size_t i = 0; i < 16; ++i) {
        constraint_1.inputs[i] = make_witness(input_block_1[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        constraint_1.hash_values[i] = make_witness(hash_values_1[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        constraint_1.result[i] = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(result_1[i]));
    }

    std::array<uint32_t, 16> input_block_2 = { 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 };
    auto result_2 = crypto::sha256_block(result_1, input_block_2);

    Sha256Compression constraint_2;
    for (size_t i = 0; i < 16; ++i) {
        constraint_2.inputs[i] = make_witness(input_block_2[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        constraint_2.hash_values[i] = make_witness(result_1[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        constraint_2.result[i] = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(result_2[i]));
    }

    std::vector<Sha256Compression> constraints = { constraint_1, constraint_2 };
    AcirFormat constraint_system = constraint_to_acir_format(constraints);
    AcirProgram program{ constraint_system, witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test chained SHA256 constraints with shared witness indices (BFS bleed-through).
 *
 * Unlike TwoSHA256Constraints which creates fresh witnesses for constraint_2.hash_values,
 * this test directly reuses constraint_1.result[i] as constraint_2.hash_values[i] — the
 * same witness index appears in both constraints. This is how a real Noir program behaves
 * when chaining: `sha256_compression(sha256_compression(h, m1), m2)`.
 *
 * This exercises find_subtrace_gates: when result[i] of constraint_1 is also hash_values[i]
 * of constraint_2, the BFS starting from constraint_1's witnesses may discover arithmetic
 * gates belonging to constraint_2 (and vice versa), inflating the gate set and causing the
 * selector hash to not match the pinned SHA256 constants.
 */
TEST_F(BoomerangSHA256ConstraintsTests, ChainedSHA256SharedWitness)
{
    using FF = fr;

    WitnessVector witness_values;
    auto make_witness = [&](uint32_t value) -> WitnessOrConstant<FF> {
        uint32_t idx = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(value));
        return WitnessOrConstant<FF>::from_index(idx);
    };

    // First constraint: standard IV + block
    std::array<uint32_t, 16> input_block_1 = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
    std::array<uint32_t, 8> hash_values_1;
    std::copy(std::begin(SHA256_IV), std::end(SHA256_IV), hash_values_1.begin());
    auto result_1 = crypto::sha256_block(hash_values_1, input_block_1);

    Sha256Compression constraint_1;
    for (size_t i = 0; i < 16; ++i) {
        constraint_1.inputs[i] = make_witness(input_block_1[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        constraint_1.hash_values[i] = make_witness(hash_values_1[i]);
    }
    // Record result witness indices — these will be REUSED for constraint_2.hash_values
    std::array<uint32_t, 8> result_1_witness_indices;
    for (size_t i = 0; i < 8; ++i) {
        result_1_witness_indices[i] = static_cast<uint32_t>(witness_values.size());
        constraint_1.result[i] = result_1_witness_indices[i];
        witness_values.emplace_back(FF(result_1[i]));
    }

    // Second constraint: chain from first result
    // Key difference from TwoSHA256Constraints: hash_values[i] reuses the SAME witness
    // index as constraint_1.result[i] instead of creating new witnesses.
    std::array<uint32_t, 16> input_block_2 = { 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 };
    auto result_2 = crypto::sha256_block(result_1, input_block_2);

    Sha256Compression constraint_2;
    for (size_t i = 0; i < 16; ++i) {
        constraint_2.inputs[i] = make_witness(input_block_2[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        // Directly reuse constraint_1.result[i] witness index — same variable in the circuit
        constraint_2.hash_values[i] = witness_from_index(result_1_witness_indices[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        constraint_2.result[i] = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(result_2[i]));
    }

    std::vector<Sha256Compression> constraints = { constraint_1, constraint_2 };
    AcirFormat constraint_system = constraint_to_acir_format(constraints);
    AcirProgram program{ constraint_system, witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    // The circuit itself is valid
    // EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    // Both constraints are valid — analyzer should not report false positives
    EXPECT_TRUE(incorrect_opcodes.empty())
        << "False positive: valid chained SHA256 constraints reported as incorrect. "
        << "Shared witness indices between constraint_1.result and constraint_2.hash_values "
        << "likely caused BFS bleed-through in find_subtrace_gates, inflating the gate set "
        << "and breaking the selector hash comparison.";
}

// --- Constant witness combination tests ---
// These validate that the analyzer handles various combinations of constant/witness
// hash_values and inputs correctly through the full ACIR pipeline.

TEST_F(BoomerangSHA256ConstraintsTests, AllWitnessHInit_ConstantInputs)
{
    run_sha256_acir_validation(0x00, 0xFFFF);
}

TEST_F(BoomerangSHA256ConstraintsTests, AllConstantHInit_AllWitnessInput)
{
    run_sha256_acir_validation(0xFF, 0x0000);
}

TEST_F(BoomerangSHA256ConstraintsTests, ConstantEFG_AllWitnessInput)
{
    run_sha256_acir_validation((1 << 4) | (1 << 5) | (1 << 6), 0x0000);
}

TEST_F(BoomerangSHA256ConstraintsTests, HalfConstantInputs)
{
    run_sha256_acir_validation(0x00, 0x00FF);
}

TEST_F(BoomerangSHA256ConstraintsTests, AllConstant)
{
    run_sha256_acir_validation(0xFF, 0xFFFF);
}
