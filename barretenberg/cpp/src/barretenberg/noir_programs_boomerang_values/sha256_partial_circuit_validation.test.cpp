/**
 * @file sha256_partial_circuit_validation.test.cpp
 * @brief Tests for per-round SHA256 compression validation with constant witnesses.
 *
 * Creates full SHA256 compression circuits via sha256_block (64 rounds), but validates
 * individual rounds using process_sha256comression_round. All 16 inputs are constant
 * (extend_witness not exercised). h_init values vary between constant and non-constant.
 */

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace acir_format;
using namespace cdg;

namespace {

using field_ct = bb::stdlib::field_t<UltraCircuitBuilder>;
using SHA256 = bb::stdlib::SHA256<UltraCircuitBuilder>;
using FF = fr;

constexpr uint32_t SHA256_IV[8] = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

constexpr uint32_t INPUT_BLOCK[16] = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;

/**
 * @brief Build SHA256 compression constraint with configurable constant h_init.
 *
 * Similar to build_standard_sha256_setup from boomerang_sha256_constraints.test.cpp,
 * but supports bitmasks to make selected h_init and input values constant.
 *
 * @param h_init_constant_mask Bitmask: bit i set means h_init[i] is constant.
 * @param input_constant_mask  Bitmask: bit i set means input[i] is constant. Default 0xFFFF (all constant).
 */
struct SHA256TestSetup {
    Sha256Compression constraint;
    WitnessVector witness_values;
};

SHA256TestSetup build_sha256_setup(uint8_t h_init_constant_mask, uint16_t input_constant_mask = 0xFFFF)
{
    SHA256TestSetup setup;

    auto make_witness = [&](uint32_t value) -> WitnessOrConstant<FF> {
        uint32_t idx = static_cast<uint32_t>(setup.witness_values.size());
        setup.witness_values.emplace_back(FF(value));
        return WitnessOrConstant<FF>::from_index(idx);
    };

    auto make_constant = [](uint32_t value) -> WitnessOrConstant<FF> {
        return WitnessOrConstant<FF>{ .index = 0, .value = FF(value), .is_constant = true };
    };

    // Inputs: constant or witness based on mask
    for (size_t i = 0; i < 16; ++i) {
        if (input_constant_mask & (1 << i)) {
            setup.constraint.inputs[i] = make_constant(INPUT_BLOCK[i]);
        } else {
            setup.constraint.inputs[i] = make_witness(INPUT_BLOCK[i]);
        }
    }

    // h_init: constant or witness based on mask
    for (size_t i = 0; i < 8; ++i) {
        if (h_init_constant_mask & (1 << i)) {
            setup.constraint.hash_values[i] = make_constant(SHA256_IV[i]);
        } else {
            setup.constraint.hash_values[i] = make_witness(SHA256_IV[i]);
        }
    }

    // Result witnesses from native computation
    std::array<uint32_t, 8> h_native;
    std::array<uint32_t, 16> in_native;
    std::copy(std::begin(SHA256_IV), std::end(SHA256_IV), h_native.begin());
    std::copy(std::begin(INPUT_BLOCK), std::end(INPUT_BLOCK), in_native.begin());
    auto result_native = crypto::sha256_block(h_native, in_native);

    for (size_t i = 0; i < 8; ++i) {
        setup.constraint.result[i] = static_cast<uint32_t>(setup.witness_values.size());
        setup.witness_values.emplace_back(FF(result_native[i]));
    }

    return setup;
}

/**
 * @brief Build circuit + AcirFormat + initial round state from a SHA256 test setup.
 */
struct RoundTestSetup {
    AcirFormat constraint_system;
    UltraCircuitBuilder builder;
    Sha256RoundState initial_state;
    std::array<uint32_t, 64> w_real; // w_real[0..15] from inputs, [16..63] = CONST (filled during loop)
    std::array<bool, 64> w_const;    // constant flags for all 64 W values
};

RoundTestSetup build_round_test(const SHA256TestSetup& setup)
{
    // Build AcirFormat through serde
    std::vector<Acir::Opcode> opcodes = constraint_to_acir_opcode(setup.constraint);
    AcirFormat cs = circuit_serde_to_acir_format(build_acir_circuit(opcodes), /*is_mega=*/false);

    // Build circuit with sha256_block
    UltraCircuitBuilder builder;
    for (const auto& val : setup.witness_values) {
        builder.add_variable(val);
    }

    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; ++i) {
        h_init[i] = to_field_ct(setup.constraint.hash_values[i], builder);
    }
    std::array<field_ct, 16> input;
    for (size_t i = 0; i < 16; ++i) {
        input[i] = to_field_ct(setup.constraint.inputs[i], builder);
    }

    [[maybe_unused]] auto output = SHA256::sha256_block(h_init, input);

    // Build initial round state
    Sha256RoundState state;
    auto to_real_or_const = [&](const WitnessOrConstant<FF>& woc) -> uint32_t {
        return woc.is_constant ? CONST : builder.real_variable_index[woc.index];
    };

    state.a = to_real_or_const(setup.constraint.hash_values[0]);
    state.b = to_real_or_const(setup.constraint.hash_values[1]);
    state.c = to_real_or_const(setup.constraint.hash_values[2]);
    state.d = to_real_or_const(setup.constraint.hash_values[3]);
    state.e = to_real_or_const(setup.constraint.hash_values[4]);
    state.f = to_real_or_const(setup.constraint.hash_values[5]);
    state.g = to_real_or_const(setup.constraint.hash_values[6]);
    state.h = to_real_or_const(setup.constraint.hash_values[7]);

    // Find sparse forms from lookup block
    auto find_sparse_in_lookup = [&](uint32_t normal_real) -> uint32_t {
        if (normal_real == CONST) {
            return CONST;
        }
        auto& lookup_block = builder.blocks.lookup;
        for (size_t gi = 0; gi < lookup_block.size(); ++gi) {
            if (builder.real_variable_index[lookup_block.w_l()[gi]] == normal_real) {
                return builder.real_variable_index[lookup_block.w_r()[gi]];
            }
        }
        return CONST;
    };

    state.b_sparse = find_sparse_in_lookup(state.b);
    state.c_sparse = find_sparse_in_lookup(state.c);
    state.f_sparse = find_sparse_in_lookup(state.f);
    state.g_sparse = find_sparse_in_lookup(state.g);

    // Build w_real[0..15] from inputs, w_real[16..63] = CONST (to be filled during round loop)
    std::array<uint32_t, 64> w_real;
    w_real.fill(CONST);
    for (size_t i = 0; i < 16; ++i) {
        w_real[i] = to_real_or_const(setup.constraint.inputs[i]);
    }

    // Compute constant flags for all 64 W values
    std::array<bool, 64> w_const{};
    for (size_t i = 0; i < 16; ++i) {
        w_const[i] = setup.constraint.inputs[i].is_constant;
    }
    for (size_t i = 16; i < 64; ++i) {
        w_const[i] = w_const[i - 15] && w_const[i - 2] && w_const[i - 7] && w_const[i - 16];
    }

    return { .constraint_system = std::move(cs),
             .builder = std::move(builder),
             .initial_state = state,
             .w_real = w_real,
             .w_const = w_const };
}

} // anonymous namespace

class SHA256PartialCircuitValidation : public ::testing::Test {};

TEST_F(SHA256PartialCircuitValidation, AllWitnessHInit_Round0)
{
    auto setup = build_sha256_setup(0x00);
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

TEST_F(SHA256PartialCircuitValidation, ConstantEFG_Round0)
{
    auto setup = build_sha256_setup((1 << 4) | (1 << 5) | (1 << 6));
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

TEST_F(SHA256PartialCircuitValidation, ConstantABC_Round0)
{
    auto setup = build_sha256_setup((1 << 0) | (1 << 1) | (1 << 2));
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

TEST_F(SHA256PartialCircuitValidation, AllConstantHInit_Round0)
{
    auto setup = build_sha256_setup(0xFF);
    auto rt = build_round_test(setup);

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

TEST_F(SHA256PartialCircuitValidation, ConstantE_Round0)
{
    auto setup = build_sha256_setup(1 << 4);
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

// --- Tests with non-constant inputs ---

TEST_F(SHA256PartialCircuitValidation, AllWitness_Round0)
{
    auto setup = build_sha256_setup(0x00, 0x0000);
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

TEST_F(SHA256PartialCircuitValidation, AllConstantHInit_AllWitnessInput_Round0)
{
    auto setup = build_sha256_setup(0xFF, 0x0000);
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

TEST_F(SHA256PartialCircuitValidation, ConstantEFG_WitnessInput0_Round0)
{
    uint16_t input_mask = 0xFFFF & ~(1 << 0);
    auto setup = build_sha256_setup((1 << 4) | (1 << 5) | (1 << 6), input_mask);
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

TEST_F(SHA256PartialCircuitValidation, AllWitnessHInit_WitnessInput0_Round0)
{
    uint16_t input_mask = 0xFFFF & ~(1 << 0);
    auto setup = build_sha256_setup(0x00, input_mask);
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    uint32_t discovered_w = CONST;
    EXPECT_TRUE(analyzer.process_sha256comression_round(state, rt.w_real[0], rt.w_const[0], 0, discovered_w));
}

// --- 64-round tests ---

static void run_64_rounds(uint8_t h_init_mask, uint16_t input_mask = 0xFFFF)
{
    auto setup = build_sha256_setup(h_init_mask, input_mask);
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    auto w_real = rt.w_real;
    const auto& w_const = rt.w_const;

    for (size_t i = 0; i < 64; ++i) {
        uint32_t w_i_real = w_const[i] ? CONST : w_real[i];
        uint32_t discovered_w_i = CONST;
        bool round_ok = analyzer.process_sha256comression_round(state, w_i_real, w_const[i], i, discovered_w_i);
        EXPECT_TRUE(round_ok) << "Round " << i << " failed";
        if (!round_ok) {
            break;
        }
        // Store discovered w[i] for future rounds (extend_witness dependencies)
        if (discovered_w_i != CONST) {
            w_real[i] = discovered_w_i;
        }
    }
}

TEST_F(SHA256PartialCircuitValidation, AllWitnessHInit_64Rounds)
{
    run_64_rounds(0x00);
}

TEST_F(SHA256PartialCircuitValidation, ConstantEFG_64Rounds)
{
    run_64_rounds((1 << 4) | (1 << 5) | (1 << 6));
}

TEST_F(SHA256PartialCircuitValidation, ConstantABC_64Rounds)
{
    run_64_rounds((1 << 0) | (1 << 1) | (1 << 2));
}

TEST_F(SHA256PartialCircuitValidation, AllConstantHInit_64Rounds)
{
    run_64_rounds(0xFF);
}

TEST_F(SHA256PartialCircuitValidation, ConstantE_64Rounds)
{
    run_64_rounds(1 << 4);
}

TEST_F(SHA256PartialCircuitValidation, AllWitness_64Rounds)
{
    run_64_rounds(0x00, 0x0000);
}

TEST_F(SHA256PartialCircuitValidation, AllConstantHInit_AllWitnessInput_64Rounds)
{
    run_64_rounds(0xFF, 0x0000);
}

TEST_F(SHA256PartialCircuitValidation, ConstantEFG_WitnessInput0_64Rounds)
{
    run_64_rounds((1 << 4) | (1 << 5) | (1 << 6), 0xFFFF & ~(1 << 0));
}

TEST_F(SHA256PartialCircuitValidation, AllWitnessHInit_WitnessInput0_64Rounds)
{
    run_64_rounds(0x00, 0xFFFF & ~(1 << 0));
}

// --- Extend witness validation tests ---

static void run_64_rounds_with_extend_witness(uint8_t h_init_mask, uint16_t input_mask)
{
    auto setup = build_sha256_setup(h_init_mask, input_mask);
    auto rt = build_round_test(setup);

    // EXPECT_TRUE(CircuitChecker::check(rt.builder));

    StaticAnalyzerAcir analyzer(std::move(rt.constraint_system), std::move(rt.builder));
    auto state = rt.initial_state;
    auto w_real = rt.w_real;
    const auto& w_const = rt.w_const;

    for (size_t i = 0; i < 64; ++i) {
        uint32_t w_i_real = w_const[i] ? CONST : w_real[i];
        uint32_t discovered_w_i = CONST;
        bool round_ok = analyzer.process_sha256comression_round(state, w_i_real, w_const[i], i, discovered_w_i);
        EXPECT_TRUE(round_ok) << "Compression round " << i << " failed";
        if (!round_ok) {
            break;
        }
        if (discovered_w_i != CONST) {
            w_real[i] = discovered_w_i;
        }

        // Validate extend_witness for w[i] >= 16 and non-constant
        if (i >= 16 && !w_const[i]) {
            ASSERT_NE(w_real[i], CONST) << "w_real[" << i << "] not discovered before extend_witness validation";
            bool ew_ok = analyzer.validate_extend_witness_iteration(w_real[i], w_real, w_const, i);
            EXPECT_TRUE(ew_ok) << "Extend witness iteration " << i << " failed";
            if (!ew_ok) {
                break;
            }
        }
    }
}

TEST_F(SHA256PartialCircuitValidation, AllWitness_ExtendWitness)
{
    run_64_rounds_with_extend_witness(0x00, 0x0000);
}

TEST_F(SHA256PartialCircuitValidation, AllWitnessHInit_WitnessInput0_ExtendWitness)
{
    run_64_rounds_with_extend_witness(0x00, 0xFFFF & ~(1 << 0));
}

TEST_F(SHA256PartialCircuitValidation, AllWitnessHInit_AllWitnessInput_ExtendWitness)
{
    run_64_rounds_with_extend_witness(0x00, 0x0000);
}

TEST_F(SHA256PartialCircuitValidation, ConstantEFG_AllWitnessInput_ExtendWitness)
{
    run_64_rounds_with_extend_witness((1 << 4) | (1 << 5) | (1 << 6), 0x0000);
}

// Tests with mixed constant/witness inputs to exercise normalization in extend_witness step 7.
// When some inputs are constant and some are witnesses, W[i] for i>=16 will have
// mixed constant dependencies (w_left or w_right constant but not both),
// which can produce xor_result_sparse with non-zero additive_constant.

TEST_F(SHA256PartialCircuitValidation, HalfConstantInputs_ExtendWitness)
{
    // inputs[0..7] constant, inputs[8..15] witness → W[i-15] and W[i-2] have mixed constness
    run_64_rounds_with_extend_witness(0x00, 0x00FF);
}

TEST_F(SHA256PartialCircuitValidation, AlternatingConstantInputs_ExtendWitness)
{
    // Even inputs constant, odd inputs witness
    run_64_rounds_with_extend_witness(0x00, 0x5555);
}

TEST_F(SHA256PartialCircuitValidation, SingleWitnessInput_ExtendWitness)
{
    // Only input[0] is witness, rest constant → most W[i-15] are constant, W[i-2] varies
    run_64_rounds_with_extend_witness(0x00, 0xFFFF & ~(1 << 0));
}

TEST_F(SHA256PartialCircuitValidation, SingleConstantInput_ExtendWitness)
{
    // Only input[0] is constant, rest witness → W[1] (= input[1]) is witness, W[i-15] mostly witness
    run_64_rounds_with_extend_witness(0x00, 0x0001);
}

// --- Full validation: compression round + extend_witness using state.w_i_real ---

// FullValidation tests moved to BoomerangSHA256ConstraintsTests (ACIR pipeline)

// --- Lookup gate exploration tests ---

TEST_F(SHA256PartialCircuitValidation, CH_INPUT_LookupGateCount)
{
    using witness_ct = bb::stdlib::witness_t<UltraCircuitBuilder>;
    using plookup_read = bb::stdlib::plookup_read<UltraCircuitBuilder>;

    UltraCircuitBuilder builder;
    field_ct e = witness_ct(&builder, SHA256_IV[4]);

    size_t lookup_before = builder.blocks.lookup.size();
    [[maybe_unused]] auto lookup = plookup_read::get_lookup_accumulators(bb::plookup::MultiTableId::SHA256_CH_INPUT, e);
    size_t lookup_after = builder.blocks.lookup.size();

    size_t num_gates = lookup_after - lookup_before;
    size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
        0, builder.blocks.lookup, lookup_before, lookup_after - 1);

    ASSERT_EQ(hash, sha256_helpers::SHA256_CH_INPUT_HASH);
    ASSERT_EQ(num_gates, 3u);
}

TEST_F(SHA256PartialCircuitValidation, MAJ_INPUT_LookupGateCount)
{
    using witness_ct = bb::stdlib::witness_t<UltraCircuitBuilder>;
    using plookup_read = bb::stdlib::plookup_read<UltraCircuitBuilder>;

    UltraCircuitBuilder builder;
    field_ct a = witness_ct(&builder, SHA256_IV[0]);

    size_t lookup_before = builder.blocks.lookup.size();
    [[maybe_unused]] auto lookup =
        plookup_read::get_lookup_accumulators(bb::plookup::MultiTableId::SHA256_MAJ_INPUT, a);
    size_t lookup_after = builder.blocks.lookup.size();

    size_t num_gates = lookup_after - lookup_before;
    size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
        0, builder.blocks.lookup, lookup_before, lookup_after - 1);

    ASSERT_EQ(hash, sha256_helpers::SHA256_MAJ_INPUT_HASH);
    ASSERT_EQ(num_gates, 3u);
}

TEST_F(SHA256PartialCircuitValidation, CH_OUTPUT_LookupGateCount)
{
    using witness_ct = bb::stdlib::witness_t<UltraCircuitBuilder>;
    using plookup_read = bb::stdlib::plookup_read<UltraCircuitBuilder>;

    UltraCircuitBuilder builder;
    field_ct input = witness_ct(&builder, fr(123456));

    size_t lookup_before = builder.blocks.lookup.size();
    [[maybe_unused]] auto result =
        plookup_read::read_from_1_to_2_table(bb::plookup::MultiTableId::SHA256_CH_OUTPUT, input);
    size_t lookup_after = builder.blocks.lookup.size();

    size_t num_gates = lookup_after - lookup_before;
    size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
        0, builder.blocks.lookup, lookup_before, lookup_after - 1);

    ASSERT_EQ(hash, sha256_helpers::SHA256_CH_OUTPUT_HASH);
    ASSERT_EQ(num_gates, 16u);
}

TEST_F(SHA256PartialCircuitValidation, MAJ_OUTPUT_LookupGateCount)
{
    using witness_ct = bb::stdlib::witness_t<UltraCircuitBuilder>;
    using plookup_read = bb::stdlib::plookup_read<UltraCircuitBuilder>;

    UltraCircuitBuilder builder;
    field_ct input = witness_ct(&builder, fr(123456));

    size_t lookup_before = builder.blocks.lookup.size();
    [[maybe_unused]] auto result =
        plookup_read::read_from_1_to_2_table(bb::plookup::MultiTableId::SHA256_MAJ_OUTPUT, input);
    size_t lookup_after = builder.blocks.lookup.size();

    size_t num_gates = lookup_after - lookup_before;
    size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
        0, builder.blocks.lookup, lookup_before, lookup_after - 1);

    ASSERT_EQ(hash, sha256_helpers::SHA256_MAJ_OUTPUT_HASH);
    ASSERT_EQ(num_gates, 11u);
}

TEST_F(SHA256PartialCircuitValidation, WITNESS_INPUT_LookupGateCount)
{
    using witness_ct = bb::stdlib::witness_t<UltraCircuitBuilder>;
    using plookup_read = bb::stdlib::plookup_read<UltraCircuitBuilder>;

    UltraCircuitBuilder builder;
    field_ct input = witness_ct(&builder, fr(12345));

    size_t lookup_before = builder.blocks.lookup.size();
    [[maybe_unused]] auto lookup =
        plookup_read::get_lookup_accumulators(bb::plookup::MultiTableId::SHA256_WITNESS_INPUT, input);
    size_t lookup_after = builder.blocks.lookup.size();

    size_t num_gates = lookup_after - lookup_before;
    size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
        0, builder.blocks.lookup, lookup_before, lookup_after - 1);

    ASSERT_EQ(hash, sha256_helpers::SHA256_WITNESS_INPUT_HASH);
    ASSERT_EQ(num_gates, 4u);
}

TEST_F(SHA256PartialCircuitValidation, WITNESS_OUTPUT_LookupGateCount)
{
    using witness_ct = bb::stdlib::witness_t<UltraCircuitBuilder>;
    using plookup_read = bb::stdlib::plookup_read<UltraCircuitBuilder>;

    UltraCircuitBuilder builder;
    field_ct input = witness_ct(&builder, fr(12345));

    size_t lookup_before = builder.blocks.lookup.size();
    [[maybe_unused]] auto result =
        plookup_read::read_from_1_to_2_table(bb::plookup::MultiTableId::SHA256_WITNESS_OUTPUT, input);
    size_t lookup_after = builder.blocks.lookup.size();

    size_t num_gates = lookup_after - lookup_before;
    size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
        0, builder.blocks.lookup, lookup_before, lookup_after - 1);

    ASSERT_EQ(hash, sha256_helpers::SHA256_WITNESS_OUTPUT_HASH);
    ASSERT_EQ(num_gates, 11u);
}
