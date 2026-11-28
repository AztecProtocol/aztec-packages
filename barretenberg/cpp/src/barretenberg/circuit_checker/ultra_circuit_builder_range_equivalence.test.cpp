#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib_circuit_builders/bounded_range_sort.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <algorithm>
#include <array>
#include <gtest/gtest.h>
#include <string>
#include <vector>

/**
 * The range-constraint paths of UltraCircuitBuilder (range_constrain_two_limbs, create_limbed_range_constraint, range
 * list processing) must build exactly the circuit that the straightforward compositions of public builder methods
 * below build: same variables, tags, copy cycles, range lists, gates, gate count and failure message.
 */

namespace bb {
namespace {

using Builder = UltraCircuitBuilder;
using Row = Builder::GateRowT;

auto& engine = numeric::get_debug_randomness();

uint256_t random_below_pow2(const uint64_t num_bits)
{
    return num_bits == 0 ? uint256_t(0) : engine.get_random_uint256() & ((uint256_t(1) << num_bits) - 1);
}

struct IntegerSelectors {
    int q_m = 0;
    int q_c = 0;
    int q_1 = 0;
    int q_2 = 0;
    int q_3 = 0;
    int q_4 = 0;
};

// A gate row whose selectors are converted from integers at run time (its gate kind is given when it's appended).
Row integer_selector_row(const int gate_value, const IntegerSelectors& selectors)
{
    Row row{};
    row.gate_value = gate_value;
    row.q_m = selectors.q_m;
    row.q_c = selectors.q_c;
    row.q_1 = selectors.q_1;
    row.q_2 = selectors.q_2;
    row.q_3 = selectors.q_3;
    row.q_4 = selectors.q_4;
    return row;
}

void reference_range_constrain_two_limbs(Builder& builder,
                                         const uint32_t lo_idx,
                                         const uint32_t hi_idx,
                                         const size_t lo_limb_bits,
                                         const size_t hi_limb_bits,
                                         const std::string& msg)
{
    if (uint256_t(builder.get_variable(lo_idx)) >= (uint256_t(1) << lo_limb_bits) && !builder.failed()) {
        builder.failure(msg + ": lo limb.");
    }
    if (uint256_t(builder.get_variable(hi_idx)) >= (uint256_t(1) << hi_limb_bits) && !builder.failed()) {
        builder.failure(msg + ": hi limb.");
    }
    const auto masks = [](const size_t limb_bits) {
        std::array<uint64_t, 5> result{};
        for (size_t i = 0; i < 5; ++i) {
            const size_t low = 14 * i;
            const size_t bits = limb_bits > low ? std::min<size_t>(limb_bits - low, 14) : 0;
            result[i] = (1ULL << bits) - 1;
        }
        return result;
    };
    const auto sublimbs = [&](const uint32_t limb_idx, const std::array<uint64_t, 5>& limb_masks) {
        const uint256_t limb(builder.get_variable(limb_idx));
        std::array<uint32_t, 5> indices{};
        for (size_t i = 0; i < 5; ++i) {
            indices[i] = limb_masks[i] != 0 ? builder.add_variable(fr((limb >> (14 * i)) & ((uint256_t(1) << 14) - 1)))
                                            : builder.zero_idx();
        }
        return indices;
    };
    const auto lo_masks = masks(lo_limb_bits);
    const auto hi_masks = masks(hi_limb_bits);
    const auto lo = sublimbs(lo_idx, lo_masks);
    const auto hi = sublimbs(hi_idx, hi_masks);

    Row row = integer_selector_row(1, { .q_3 = 1, .q_4 = 1 });
    row.wires = { lo[0], lo[1], lo[2], lo_idx };
    builder.blocks.nnf.append_gate<GateKind::Nnf>(row);
    row = integer_selector_row(1, { .q_m = 1, .q_3 = 1 });
    row.wires = { lo[3], lo[4], hi[0], hi[1] };
    builder.blocks.nnf.append_gate<GateKind::Nnf>(row);
    row = integer_selector_row(0, {});
    row.wires = { hi[2], hi[3], hi[4], hi_idx };
    builder.blocks.nnf.append_gate<GateKind::Nnf>(row);
    builder.increment_num_gates(3);

    for (size_t i = 0; i < 5; ++i) {
        if (lo_masks[i] != 0) {
            builder.create_small_range_constraint(
                lo[i], lo_masks[i], "ultra_circuit_builder: sublimb of low too large");
        }
        if (hi_masks[i] != 0) {
            builder.create_small_range_constraint(hi[i], hi_masks[i], "ultra_circuit_builder: sublimb of hi too large");
        }
    }
}

std::vector<uint32_t> reference_create_limbed_range_constraint(Builder& builder,
                                                               const uint32_t variable_index,
                                                               const uint64_t num_bits,
                                                               const uint64_t target_range_bitnum,
                                                               const std::string& msg)
{
    const uint256_t val(builder.get_variable(variable_index));
    if (val.get_msb() >= num_bits && !builder.failed()) {
        builder.failure(msg);
    }
    const uint64_t sublimb_mask = (1ULL << target_range_bitnum) - 1;
    const bool has_remainder_bits = (num_bits % target_range_bitnum != 0);
    const uint64_t num_limbs = (num_bits / target_range_bitnum) + (has_remainder_bits ? 1U : 0U);
    const uint64_t last_limb_range = (1ULL << (num_bits % target_range_bitnum)) - 1;

    std::vector<uint64_t> sublimbs;
    uint256_t accumulator = val;
    for (uint64_t j = 0; j < num_limbs; ++j) {
        sublimbs.push_back(accumulator.data[0] & sublimb_mask);
        accumulator = accumulator >> target_range_bitnum;
    }
    std::vector<uint32_t> sublimb_indices;
    for (uint64_t j = 0; j < num_limbs; ++j) {
        const uint32_t limb_idx = builder.add_variable(fr(sublimbs[j]));
        sublimb_indices.push_back(limb_idx);
        const bool is_remainder_limb = has_remainder_bits && (j == num_limbs - 1);
        builder.create_small_range_constraint(
            limb_idx, is_remainder_limb ? last_limb_range : sublimb_mask, "create_small_range_constraint");
    }

    const uint64_t num_limb_triples = (num_limbs + 2) / 3;
    accumulator = val;
    uint32_t accumulator_idx = variable_index;
    for (uint64_t i = 0; i < num_limb_triples; ++i) {
        const bool is_last_triple = (i == num_limb_triples - 1);
        std::array<uint32_t, 3> limbs{};
        std::array<uint64_t, 3> values{};
        std::array<uint64_t, 3> shifts{};
        for (uint64_t k = 0; k < 3; ++k) {
            const uint64_t j = (3 * i) + k;
            limbs[k] = j < num_limbs ? sublimb_indices[j] : builder.zero_idx();
            values[k] = j < num_limbs ? sublimbs[j] : 0;
            shifts[k] = target_range_bitnum * j;
        }
        const uint256_t new_accumulator = accumulator - (uint256_t(values[0]) << shifts[0]) -
                                          (uint256_t(values[1]) << shifts[1]) - (uint256_t(values[2]) << shifts[2]);
        builder.create_big_add_gate({ limbs[0],
                                      limbs[1],
                                      limbs[2],
                                      accumulator_idx,
                                      fr(uint256_t(1) << shifts[0]),
                                      fr(uint256_t(1) << shifts[1]),
                                      fr(uint256_t(1) << shifts[2]),
                                      fr(-1),
                                      fr(0) },
                                    !is_last_triple);
        if (!is_last_triple) {
            accumulator_idx = builder.add_variable(fr(new_accumulator));
            accumulator = new_accumulator;
        }
    }
    return sublimb_indices;
}

void reference_process_range_list(Builder& builder, Builder::RangeList& list)
{
    for (uint32_t& x : list.variable_indices) {
        x = builder.real_variable_index[x];
    }
    std::sort(list.variable_indices.begin(), list.variable_indices.end());
    list.variable_indices.erase(std::unique(list.variable_indices.begin(), list.variable_indices.end()),
                                list.variable_indices.end());

    std::vector<uint32_t> sorted_list;
    bool values_in_range = true;
    for (const uint32_t variable_index : list.variable_indices) {
        const uint256_t value(builder.get_variable(variable_index));
        values_in_range = values_in_range && value <= uint256_t(list.target_range);
        sorted_list.push_back(static_cast<uint32_t>(value.data[0]));
    }
    if (!values_in_range || !range_sort::try_counting_sort(sorted_list, list.target_range)) {
        std::sort(sorted_list.begin(), sorted_list.end());
    }

    constexpr size_t gate_width = Builder::NUM_WIRES;
    size_t padding = (gate_width - (list.variable_indices.size() % gate_width)) % gate_width;
    if (list.variable_indices.size() <= gate_width) {
        padding += gate_width;
    }
    std::vector<uint32_t> indices(padding, builder.zero_idx());
    for (const uint32_t sorted_value : sorted_list) {
        const uint32_t index = builder.add_variable(fr(sorted_value));
        builder.assign_tag(index, list.tau_tag);
        indices.push_back(index);
    }
    builder.create_sort_constraint_with_edges(indices, fr(0), fr(list.target_range));
}

void reference_finalize_circuit(Builder& builder)
{
    builder.process_non_native_field_multiplications();
    builder.rom_ram_logic.process_ROM_arrays(&builder);
    builder.rom_ram_logic.process_RAM_arrays(&builder);
    for (auto& [target_range, list] : builder.range_lists) {
        reference_process_range_list(builder, list);
    }
    builder.populate_public_inputs_block();
    builder.circuit_finalized = true;
}

void expect_same_circuit(const Builder& actual, const Builder& expected)
{
    // The base comparison covers variables, copy cycles, tags, tau, gate count, public inputs and failure state.
    EXPECT_TRUE(static_cast<const CircuitBuilderBase<fr>&>(actual) ==
                static_cast<const CircuitBuilderBase<fr>&>(expected));
    EXPECT_EQ(actual.get_num_variables(), expected.get_num_variables());
    EXPECT_EQ(actual.num_gates(), expected.num_gates());
    EXPECT_EQ(actual.err(), expected.err());
    EXPECT_TRUE(actual.real_variable_tags == expected.real_variable_tags);
    EXPECT_TRUE(actual.range_lists == expected.range_lists);
    EXPECT_TRUE(actual.blocks == expected.blocks);
}

// Builds the same inputs into an actual and a reference builder and compares them before and after finalization.
class RangeEquivalence : public ::testing::TestWithParam<bool> {
  protected:
    Builder actual{ GetParam() };
    Builder expected{ GetParam() };

    std::pair<uint32_t, uint32_t> add_variable(const fr& value)
    {
        return { actual.add_variable(value), expected.add_variable(value) };
    }

    void two_limbs(const uint256_t& lo, const uint256_t& hi, const size_t lo_bits, const size_t hi_bits)
    {
        const auto [lo_actual, lo_expected] = add_variable(fr(lo));
        const auto [hi_actual, hi_expected] = add_variable(fr(hi));
        ASSERT_EQ(lo_actual, lo_expected);
        ASSERT_EQ(hi_actual, hi_expected);
        actual.range_constrain_two_limbs(lo_actual, hi_actual, lo_bits, hi_bits, "two limbs");
        reference_range_constrain_two_limbs(expected, lo_expected, hi_expected, lo_bits, hi_bits, "two limbs");
    }

    void limbed(const uint256_t& value, const uint64_t num_bits, const uint64_t bitnum)
    {
        const auto [idx_actual, idx_expected] = add_variable(fr(value));
        ASSERT_EQ(idx_actual, idx_expected);
        const auto limbs_actual = actual.create_limbed_range_constraint(idx_actual, num_bits, bitnum, "limbed");
        const auto limbs_expected =
            reference_create_limbed_range_constraint(expected, idx_expected, num_bits, bitnum, "limbed");
        EXPECT_EQ(limbs_actual, limbs_expected);
    }

    void small(const uint64_t value, const uint64_t target_range)
    {
        const auto [idx_actual, idx_expected] = add_variable(fr(value));
        actual.create_unconstrained_gate(
            actual.blocks.arithmetic, idx_actual, actual.zero_idx(), actual.zero_idx(), actual.zero_idx());
        expected.create_unconstrained_gate(
            expected.blocks.arithmetic, idx_expected, expected.zero_idx(), expected.zero_idx(), expected.zero_idx());
        actual.create_small_range_constraint(idx_actual, target_range, "small");
        expected.create_small_range_constraint(idx_expected, target_range, "small");
    }

    void expect_same_before_and_after_finalization(const bool expect_valid)
    {
        expect_same_circuit(actual, expected);
        EXPECT_EQ(actual.failed(), !expect_valid) << actual.err();
        if (!GetParam()) {
            EXPECT_EQ(CircuitChecker::check(actual), expect_valid);
        }
        actual.finalize_circuit();
        reference_finalize_circuit(expected);
        expect_same_circuit(actual, expected);
    }
};

TEST_P(RangeEquivalence, TwoLimbs)
{
    const std::array<std::pair<size_t, size_t>, 8> limb_bits{
        { { 68, 68 }, { 70, 70 }, { 14, 28 }, { 1, 57 }, { 0, 13 }, { 56, 42 }, { 69, 3 }, { 15, 70 } }
    };
    for (const auto& [lo_bits, hi_bits] : limb_bits) {
        for (size_t i = 0; i < 8; ++i) {
            two_limbs(random_below_pow2(lo_bits), random_below_pow2(hi_bits), lo_bits, hi_bits);
        }
        // Largest in-range values.
        two_limbs((uint256_t(1) << lo_bits) - 1, (uint256_t(1) << hi_bits) - 1, lo_bits, hi_bits);
    }
    expect_same_before_and_after_finalization(true);
}

TEST_P(RangeEquivalence, Limbed)
{
    const std::array<uint64_t, 5> bitnums{ Builder::DEFAULT_PLOOKUP_RANGE_BITNUM, 16, 8, 3, 1 };
    const std::array<uint64_t, 19> bit_counts{ 1,  2,  13, 14, 15,  27,  28,  29,  41, 42,
                                               43, 64, 68, 70, 100, 128, 136, 252, 253 };
    for (const uint64_t bitnum : bitnums) {
        for (const uint64_t num_bits : bit_counts) {
            limbed(random_below_pow2(num_bits), num_bits, bitnum);
            limbed((uint256_t(1) << num_bits) - 1, num_bits, bitnum);
            limbed(0, num_bits, bitnum);
        }
    }
    expect_same_before_and_after_finalization(true);
}

TEST_P(RangeEquivalence, MixedSequence)
{
    // Interleaves the paths so that range lists are created by each of them first and shared afterwards, including
    // small ranges equal to sublimb ranges and constraints on sublimbs that already carry a range tag.
    const std::array<uint64_t, 6> small_ranges{ (1U << 14) - 1, (1U << 12) - 1, (1U << 6) - 1, 7, 255, 1 };
    for (size_t i = 0; i < 300; ++i) {
        switch (engine.get_random_uint8() % 4U) {
        case 0: {
            const size_t lo_bits = engine.get_random_uint8() % 71U;
            const size_t hi_bits = engine.get_random_uint8() % 71U;
            two_limbs(random_below_pow2(lo_bits), random_below_pow2(hi_bits), lo_bits, hi_bits);
            break;
        }
        case 1: {
            const uint64_t num_bits = 1 + (engine.get_random_uint8() % Builder::MAX_NUM_BITS_RANGE_CONSTRAINT);
            const uint64_t bitnum = (engine.get_random_uint8() % 2) == 0 ? Builder::DEFAULT_PLOOKUP_RANGE_BITNUM
                                                                         : 1U + (engine.get_random_uint8() % 16U);
            limbed(random_below_pow2(num_bits), num_bits, bitnum);
            break;
        }
        case 2: {
            const uint64_t target_range = small_ranges[engine.get_random_uint8() % small_ranges.size()];
            small(engine.get_random_uint64() % (target_range + 1), target_range);
            break;
        }
        default: {
            // Re-constrain the last sublimb created to a smaller range: the generic path copies the witness.
            const auto [idx_actual, idx_expected] = add_variable(fr(5));
            const auto limbs_actual = actual.create_limbed_range_constraint(idx_actual, 20, 14, "limbed");
            const auto limbs_expected =
                reference_create_limbed_range_constraint(expected, idx_expected, 20, 14, "limbed");
            ASSERT_EQ(limbs_actual, limbs_expected);
            actual.create_small_range_constraint(limbs_actual.front(), 7, "smaller");
            expected.create_small_range_constraint(limbs_expected.front(), 7, "smaller");
            break;
        }
        }
    }
    expect_same_before_and_after_finalization(true);
}

TEST_P(RangeEquivalence, OutOfRangeValuesKeepTheFirstFailure)
{
    // Each call below fails; only the first failure message is kept, and the circuit is still built the same way.
    two_limbs(uint256_t(1) << 68, 3, 68, 68);
    two_limbs(3, uint256_t(1) << 68, 68, 68);
    two_limbs(engine.get_random_uint256(), engine.get_random_uint256(), 70, 70);
    limbed(uint256_t(1) << 100, 100, 14);
    limbed(engine.get_random_uint256(), 253, 14);
    limbed(uint256_t(1) << 20, 20, 4);
    EXPECT_EQ(actual.err(), "two limbs: lo limb.");
    expect_same_before_and_after_finalization(false);
}

TEST_P(RangeEquivalence, OutOfRangeLimbedFailureMessage)
{
    limbed(uint256_t(1) << 40, 40, 14);
    EXPECT_EQ(actual.err(), "limbed");
    two_limbs(uint256_t(1) << 68, uint256_t(1) << 68, 68, 68);
    expect_same_before_and_after_finalization(false);
}

TEST_P(RangeEquivalence, OutOfRangeHiLimbFailureMessage)
{
    two_limbs(5, uint256_t(1) << 50, 68, 50);
    EXPECT_EQ(actual.err(), "two limbs: hi limb.");
    expect_same_before_and_after_finalization(false);
}

INSTANTIATE_TEST_SUITE_P(UltraCircuitBuilder, RangeEquivalence, ::testing::Values(false, true));

TEST(UltraCircuitBuilderRangeEquivalence, SelectorRowsMatchIntegerSelectors)
{
    const Builder builder;
    using NNF = Builder::NNF_SELECTORS;
    using MEM = Builder::MEMORY_SELECTORS;
    EXPECT_TRUE(builder.nnf_selectors_row(NNF::NNF_NONE) == integer_selector_row(0, {}));
    EXPECT_TRUE(builder.nnf_selectors_row(NNF::LIMB_ACCUMULATE_1) == integer_selector_row(1, { .q_3 = 1, .q_4 = 1 }));
    EXPECT_TRUE(builder.nnf_selectors_row(NNF::LIMB_ACCUMULATE_2) == integer_selector_row(1, { .q_m = 1, .q_3 = 1 }));
    EXPECT_TRUE(builder.nnf_selectors_row(NNF::NON_NATIVE_FIELD_1) == integer_selector_row(1, { .q_2 = 1, .q_3 = 1 }));
    EXPECT_TRUE(builder.nnf_selectors_row(NNF::NON_NATIVE_FIELD_2) == integer_selector_row(1, { .q_2 = 1, .q_4 = 1 }));
    EXPECT_TRUE(builder.nnf_selectors_row(NNF::NON_NATIVE_FIELD_3) == integer_selector_row(1, { .q_m = 1, .q_2 = 1 }));

    EXPECT_TRUE(builder.memory_selectors_row(MEM::MEM_NONE) == integer_selector_row(0, {}));
    EXPECT_TRUE(builder.memory_selectors_row(MEM::ROM_CONSISTENCY_CHECK) ==
                integer_selector_row(1, { .q_1 = 1, .q_2 = 1 }));
    EXPECT_TRUE(builder.memory_selectors_row(MEM::RAM_CONSISTENCY_CHECK) == integer_selector_row(1, { .q_3 = 1 }));
    EXPECT_TRUE(builder.memory_selectors_row(MEM::RAM_TIMESTAMP_CHECK) ==
                integer_selector_row(1, { .q_1 = 1, .q_4 = 1 }));
    EXPECT_TRUE(builder.memory_selectors_row(MEM::ROM_READ) == integer_selector_row(1, { .q_m = 1, .q_1 = 1 }));
    EXPECT_TRUE(builder.memory_selectors_row(MEM::RAM_READ) == integer_selector_row(1, { .q_m = 1, .q_1 = 1 }));
    EXPECT_TRUE(builder.memory_selectors_row(MEM::RAM_WRITE) ==
                integer_selector_row(1, { .q_m = 1, .q_c = 1, .q_1 = 1 }));
    EXPECT_TRUE(builder.memory_selectors_row(MEM::ROM_LOGUP_TABLE) == integer_selector_row(1, { .q_2 = 1 }));
    EXPECT_TRUE(builder.memory_selectors_row(MEM::ROM_LOGUP_READ) == integer_selector_row(1, { .q_4 = 1 }));
}

TEST(UltraCircuitBuilderRangeEquivalence, GateConstructorsUseIntegerSelectors)
{
    Builder builder;
    const uint32_t a = builder.add_variable(fr(3));
    const uint32_t b = builder.add_variable(fr(5));
    const auto last_row = [](auto& block) {
        Row row{};
        const size_t idx = block.size() - 1;
        row.wires = { block.w_l()[idx], block.w_r()[idx], block.w_o()[idx], block.w_4()[idx] };
        row.q_m = block.q_m()[idx];
        row.q_c = block.q_c()[idx];
        row.q_1 = block.q_1()[idx];
        row.q_2 = block.q_2()[idx];
        row.q_3 = block.q_3()[idx];
        row.q_4 = block.q_4()[idx];
        return row;
    };
    const auto expect_arith_row = [&](const IntegerSelectors& selectors, const int gate_value) {
        const auto& block = builder.blocks.arithmetic;
        const size_t idx = block.size() - 1;
        Row expected_row = integer_selector_row(0, selectors);
        Row actual_row = last_row(builder.blocks.arithmetic);
        expected_row.wires = actual_row.wires;
        EXPECT_TRUE(actual_row == expected_row);
        EXPECT_EQ(read_gate_selector(block, GateKind::Arith, idx), fr(gate_value));
    };

    builder.create_bool_gate(a);
    expect_arith_row({ .q_m = 1, .q_1 = -1 }, 1);
    builder.create_big_add_gate({ a, b, a, b, 1, 1, -1, -1, 0 }, true);
    expect_arith_row({ .q_1 = 1, .q_2 = 1, .q_3 = -1, .q_4 = -1 }, 2);
    builder.create_big_add_gate({ a, b, a, b, 1, 1, -1, -1, 0 }, false);
    expect_arith_row({ .q_1 = 1, .q_2 = 1, .q_3 = -1, .q_4 = -1 }, 1);
    builder.create_big_mul_add_gate({ a, b, a, b, 1, 0, 0, -1, 0, 0 }, true);
    expect_arith_row({ .q_m = 2, .q_3 = -1 }, 2);
    builder.create_add_gate({ a, b, a, 1, 1, -1, 0 });
    expect_arith_row({ .q_1 = 1, .q_2 = 1, .q_3 = -1 }, 1);
    builder.fix_witness(a, fr(3));
    expect_arith_row({ .q_c = -3, .q_1 = 1 }, 1);
}

} // namespace
} // namespace bb
