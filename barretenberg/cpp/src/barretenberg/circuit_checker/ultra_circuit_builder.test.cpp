#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}
namespace bb {

TEST(UltraCircuitBuilder, CopyConstructor)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = builder.add_variable(fr(left));
            uint32_t right_idx = builder.add_variable(fr(right));
            uint32_t result_idx = builder.add_variable(fr(left ^ right));

            uint32_t add_idx = builder.add_variable(fr(left) + fr(right) + builder.get_variable(result_idx));
            builder.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);

    UltraCircuitBuilder duplicate_builder{ builder };

    EXPECT_EQ(duplicate_builder.get_estimated_num_finalized_gates(), builder.get_estimated_num_finalized_gates());
    EXPECT_TRUE(CircuitChecker::check(duplicate_builder));
}

TEST(UltraCircuitBuilder, CreateGatesFromPlookupAccumulators)
{

    UltraCircuitBuilder circuit_builder = UltraCircuitBuilder();

    fr input_value = fr::random_element();
    const fr input_lo = static_cast<uint256_t>(input_value).slice(0, plookup::fixed_base::table::BITS_PER_LO_SCALAR);
    const auto input_lo_index = circuit_builder.add_variable(input_lo);

    const auto sequence_data_lo = plookup::get_lookup_accumulators(plookup::MultiTableId::FIXED_BASE_LEFT_LO, input_lo);

    const auto lookup_witnesses = circuit_builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, sequence_data_lo, input_lo_index);

    const size_t num_lookups = plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE;

    EXPECT_EQ(num_lookups, lookup_witnesses[plookup::ColumnIdx::C1].size());

    {
        const auto mask = plookup::fixed_base::table::MAX_TABLE_SIZE - 1;

        grumpkin::g1::affine_element base_point = plookup::fixed_base::table::lhs_generator_point();
        std::vector<uint8_t> input_buf;
        write(input_buf, base_point);
        const auto offset_generators =
            grumpkin::g1::derive_generators(input_buf, plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE);

        grumpkin::g1::element accumulator = base_point;
        uint256_t expected_scalar(input_lo);
        const auto table_bits = plookup::fixed_base::table::BITS_PER_TABLE;
        const auto num_tables = plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE;
        for (size_t i = 0; i < num_tables; ++i) {

            auto round_scalar = circuit_builder.get_variable(lookup_witnesses[plookup::ColumnIdx::C1][i]);
            auto round_x = circuit_builder.get_variable(lookup_witnesses[plookup::ColumnIdx::C2][i]);
            auto round_y = circuit_builder.get_variable(lookup_witnesses[plookup::ColumnIdx::C3][i]);

            EXPECT_EQ(uint256_t(round_scalar), expected_scalar);

            auto next_scalar = static_cast<uint256_t>(
                (i == num_tables - 1) ? fr(0)
                                      : circuit_builder.get_variable(lookup_witnesses[plookup::ColumnIdx::C1][i + 1]));

            uint256_t slice = static_cast<uint256_t>(round_scalar) - (next_scalar << table_bits);
            EXPECT_EQ(slice, (uint256_t(input_lo) >> (i * table_bits)) & mask);

            grumpkin::g1::affine_element expected_point(accumulator * static_cast<uint256_t>(slice) +
                                                        offset_generators[i]);

            EXPECT_EQ(round_x, expected_point.x);
            EXPECT_EQ(round_y, expected_point.y);
            for (size_t j = 0; j < table_bits; ++j) {
                accumulator = accumulator.dbl();
            }
            expected_scalar >>= table_bits;
        }
    }

    bool result = CircuitChecker::check(circuit_builder);
    EXPECT_EQ(result, true);
}

TEST(UltraCircuitBuilder, BadLookupFailure)
{
    UltraCircuitBuilder builder;
    MockCircuits::add_lookup_gates(builder);

    // Erroneously set a non-zero wire value to zero in one of the lookup gates
    for (auto& wire_3_witness_idx : builder.blocks.lookup.w_o()) {
        if (wire_3_witness_idx != builder.zero_idx) {
            wire_3_witness_idx = builder.zero_idx;
            break;
        }
    }

    EXPECT_FALSE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, BaseCase)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    fr a = fr::one();
    builder.add_public_variable(a);
    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}
TEST(UltraCircuitBuilder, TestNoLookupProof)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = builder.add_variable(fr(left));
            uint32_t right_idx = builder.add_variable(fr(right));
            uint32_t result_idx = builder.add_variable(fr(left ^ right));

            uint32_t add_idx = builder.add_variable(fr(left) + fr(right) + builder.get_variable(result_idx));
            builder.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TEST(UltraCircuitBuilder, TestEllipticGate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);

    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = builder.add_variable(p1.x);
    uint32_t y1 = builder.add_variable(p1.y);
    uint32_t x2 = builder.add_variable(p2.x);
    uint32_t y2 = builder.add_variable(p2.y);
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);

    builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);

    builder.create_ecc_add_gate({ x1 + 1, y1, x2, y2, x3, y3, 1 });

    EXPECT_EQ(CircuitChecker::check(builder), false);
}

TEST(UltraCircuitBuilder, TestEllipticDoubleGate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p3(element(p1).dbl());

    uint32_t x1 = builder.add_variable(p1.x);
    uint32_t y1 = builder.add_variable(p1.y);
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);

    builder.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TEST(UltraCircuitBuilder, NonTrivialTagPermutation)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    fr a = fr::random_element();
    fr b = -a;

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(b);
    auto c_idx = builder.add_variable(b);
    auto d_idx = builder.add_variable(a);

    builder.create_add_gate({ a_idx, b_idx, builder.zero_idx, fr::one(), fr::one(), fr::zero(), fr::zero() });
    builder.create_add_gate({ c_idx, d_idx, builder.zero_idx, fr::one(), fr::one(), fr::zero(), fr::zero() });

    builder.create_tag(1, 2);
    builder.create_tag(2, 1);

    builder.assign_tag(a_idx, 1);
    builder.assign_tag(b_idx, 1);
    builder.assign_tag(c_idx, 2);
    builder.assign_tag(d_idx, 2);

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);

    // Break the tag
    builder.real_variable_tags[builder.real_variable_index[a_idx]] = 2;
    EXPECT_EQ(CircuitChecker::check(builder), false);
}

TEST(UltraCircuitBuilder, NonTrivialTagPermutationAndCycles)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    fr a = fr::random_element();
    fr c = -a;

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(a);
    builder.assert_equal(a_idx, b_idx);
    auto c_idx = builder.add_variable(c);
    auto d_idx = builder.add_variable(c);
    builder.assert_equal(c_idx, d_idx);
    auto e_idx = builder.add_variable(a);
    auto f_idx = builder.add_variable(a);
    builder.assert_equal(e_idx, f_idx);
    auto g_idx = builder.add_variable(c);
    auto h_idx = builder.add_variable(c);
    builder.assert_equal(g_idx, h_idx);

    builder.create_tag(1, 2);
    builder.create_tag(2, 1);

    builder.assign_tag(a_idx, 1);
    builder.assign_tag(c_idx, 1);
    builder.assign_tag(e_idx, 2);
    builder.assign_tag(g_idx, 2);

    builder.create_add_gate({ b_idx, a_idx, builder.zero_idx, fr::one(), fr::neg_one(), fr::zero(), fr::zero() });
    builder.create_add_gate({ c_idx, g_idx, builder.zero_idx, fr::one(), -fr::one(), fr::zero(), fr::zero() });
    builder.create_add_gate({ e_idx, f_idx, builder.zero_idx, fr::one(), -fr::one(), fr::zero(), fr::zero() });

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);

    // Break the tag
    builder.real_variable_tags[builder.real_variable_index[a_idx]] = 2;
    EXPECT_EQ(CircuitChecker::check(builder), false);
}
TEST(UltraCircuitBuilder, BadTagPermutation)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    fr a = fr::random_element();
    fr b = -a;

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(b);
    auto c_idx = builder.add_variable(b);
    auto d_idx = builder.add_variable(a + 1);

    builder.create_add_gate({ a_idx, b_idx, builder.zero_idx, 1, 1, 0, 0 });
    builder.create_add_gate({ c_idx, d_idx, builder.zero_idx, 1, 1, 0, -1 });

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);

    builder.create_tag(1, 2);
    builder.create_tag(2, 1);

    builder.assign_tag(a_idx, 1);
    builder.assign_tag(b_idx, 1);
    builder.assign_tag(c_idx, 2);
    builder.assign_tag(d_idx, 2);

    result = CircuitChecker::check(builder);
    EXPECT_EQ(result, false);
}

TEST(UltraCircuitBuilder, SortWidget)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(b);
    auto c_idx = builder.add_variable(c);
    auto d_idx = builder.add_variable(d);
    builder.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

std::vector<uint32_t> add_variables(UltraCircuitBuilder& builder, std::vector<fr> variables)
{
    std::vector<uint32_t> res;
    for (size_t i = 0; i < variables.size(); i++) {
        res.emplace_back(builder.add_variable(variables[i]));
    }
    return res;
}
TEST(UltraCircuitBuilder, SortWithEdgesGate)
{
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);
    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);

    {
        UltraCircuitBuilder builder;
        auto a_idx = builder.add_variable(a);
        auto b_idx = builder.add_variable(b);
        auto c_idx = builder.add_variable(c);
        auto d_idx = builder.add_variable(d);
        auto e_idx = builder.add_variable(e);
        auto f_idx = builder.add_variable(f);
        auto g_idx = builder.add_variable(g);
        auto h_idx = builder.add_variable(h);
        builder.create_sort_constraint_with_edges({ a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, h);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    {
        UltraCircuitBuilder builder;
        auto a_idx = builder.add_variable(a);
        auto b_idx = builder.add_variable(b);
        auto c_idx = builder.add_variable(c);
        auto d_idx = builder.add_variable(d);
        auto e_idx = builder.add_variable(e);
        auto f_idx = builder.add_variable(f);
        auto g_idx = builder.add_variable(g);
        auto h_idx = builder.add_variable(h);
        builder.create_sort_constraint_with_edges({ a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, g);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
    {
        UltraCircuitBuilder builder;
        auto a_idx = builder.add_variable(a);
        auto b_idx = builder.add_variable(b);
        auto c_idx = builder.add_variable(c);
        auto d_idx = builder.add_variable(d);
        auto e_idx = builder.add_variable(e);
        auto f_idx = builder.add_variable(f);
        auto g_idx = builder.add_variable(g);
        auto h_idx = builder.add_variable(h);
        builder.create_sort_constraint_with_edges({ a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, b, h);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
    {
        UltraCircuitBuilder builder;
        auto a_idx = builder.add_variable(a);
        auto c_idx = builder.add_variable(c);
        auto d_idx = builder.add_variable(d);
        auto e_idx = builder.add_variable(e);
        auto f_idx = builder.add_variable(f);
        auto g_idx = builder.add_variable(g);
        auto h_idx = builder.add_variable(h);
        auto b2_idx = builder.add_variable(fr(15));
        builder.create_sort_constraint_with_edges({ a_idx, b2_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, b, h);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
    {
        UltraCircuitBuilder builder = UltraCircuitBuilder();
        auto idx = add_variables(builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                            26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });
        builder.create_sort_constraint_with_edges(idx, 1, 45);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }
    {
        UltraCircuitBuilder builder = UltraCircuitBuilder();
        auto idx = add_variables(builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                            26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });

        builder.create_sort_constraint_with_edges(idx, 1, 29);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
}

TEST(UltraCircuitBuilder, RangeConstraint)
{
    {
        UltraCircuitBuilder builder = UltraCircuitBuilder();
        auto indices = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 8);
        }
        // auto ind = {a_idx,b_idx,c_idx,d_idx,e_idx,f_idx,g_idx,h_idx};
        builder.create_sort_constraint(indices);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }
    {
        UltraCircuitBuilder builder = UltraCircuitBuilder();
        auto indices = add_variables(builder, { 3 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 3);
        }
        // auto ind = {a_idx,b_idx,c_idx,d_idx,e_idx,f_idx,g_idx,h_idx};
        builder.create_dummy_constraints(indices);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }
    {
        UltraCircuitBuilder builder = UltraCircuitBuilder();
        auto indices = add_variables(builder, { 1, 2, 3, 4, 5, 6, 8, 25 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 8);
        }
        builder.create_sort_constraint(indices);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
    {
        UltraCircuitBuilder builder = UltraCircuitBuilder();
        auto indices =
            add_variables(builder, { 1, 2, 3, 4, 5, 6, 10, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 19, 51 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 128);
        }
        builder.create_dummy_constraints(indices);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }
    {
        UltraCircuitBuilder builder = UltraCircuitBuilder();
        auto indices =
            add_variables(builder, { 1, 2, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 79);
        }
        builder.create_dummy_constraints(indices);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
    {
        UltraCircuitBuilder builder = UltraCircuitBuilder();
        auto indices =
            add_variables(builder, { 1, 0, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 79);
        }
        builder.create_dummy_constraints(indices);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
}

TEST(UltraCircuitBuilder, RangeWithGates)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    auto idx = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        builder.create_new_range_constraint(idx[i], 8);
    }

    builder.create_add_gate({ idx[0], idx[1], builder.zero_idx, fr::one(), fr::one(), fr::zero(), -3 });
    builder.create_add_gate({ idx[2], idx[3], builder.zero_idx, fr::one(), fr::one(), fr::zero(), -7 });
    builder.create_add_gate({ idx[4], idx[5], builder.zero_idx, fr::one(), fr::one(), fr::zero(), -11 });
    builder.create_add_gate({ idx[6], idx[7], builder.zero_idx, fr::one(), fr::one(), fr::zero(), -15 });
    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TEST(UltraCircuitBuilder, RangeWithGatesWhereRangeIsNotAPowerOfTwo)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    auto idx = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        builder.create_new_range_constraint(idx[i], 12);
    }

    builder.create_add_gate({ idx[0], idx[1], builder.zero_idx, fr::one(), fr::one(), fr::zero(), -3 });
    builder.create_add_gate({ idx[2], idx[3], builder.zero_idx, fr::one(), fr::one(), fr::zero(), -7 });
    builder.create_add_gate({ idx[4], idx[5], builder.zero_idx, fr::one(), fr::one(), fr::zero(), -11 });
    builder.create_add_gate({ idx[6], idx[7], builder.zero_idx, fr::one(), fr::one(), fr::zero(), -15 });
    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TEST(UltraCircuitBuilder, SortWidgetComplex)
{
    {

        UltraCircuitBuilder builder = UltraCircuitBuilder();
        std::vector<fr> a = { 1, 3, 4, 7, 7, 8, 11, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 };
        std::vector<uint32_t> ind;
        for (size_t i = 0; i < a.size(); i++)
            ind.emplace_back(builder.add_variable(a[i]));
        builder.create_sort_constraint(ind);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }
    {

        UltraCircuitBuilder builder = UltraCircuitBuilder();
        std::vector<fr> a = { 1, 3, 4, 7, 7, 8, 16, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 };
        std::vector<uint32_t> ind;
        for (size_t i = 0; i < a.size(); i++)
            ind.emplace_back(builder.add_variable(a[i]));
        builder.create_sort_constraint(ind);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
}
TEST(UltraCircuitBuilder, SortWidgetNeg)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(8);

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(b);
    auto c_idx = builder.add_variable(c);
    auto d_idx = builder.add_variable(d);
    builder.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, false);
}

TEST(UltraCircuitBuilder, ComposedRangeConstraint)
{
    // even num bits - not divisible by 3
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 133);
    auto e = fr(d);
    auto a_idx = builder.add_variable(fr(e));
    builder.create_add_gate({ a_idx, builder.zero_idx, builder.zero_idx, 1, 0, 0, -fr(e) });
    builder.decompose_into_default_range(a_idx, 134);

    // odd num bits - divisible by 3
    auto c_1 = fr::random_element();
    auto d_1 = uint256_t(c_1).slice(0, 126);
    auto e_1 = fr(d_1);
    auto a_idx_1 = builder.add_variable(fr(e_1));
    builder.create_add_gate({ a_idx_1, builder.zero_idx, builder.zero_idx, 1, 0, 0, -fr(e_1) });
    builder.decompose_into_default_range(a_idx_1, 127);

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TEST(UltraCircuitBuilder, NonNativeFieldMultiplication)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    fq a = fq::random_element();
    fq b = fq::random_element();
    uint256_t modulus = fq::modulus;

    uint1024_t a_big = uint512_t(uint256_t(a));
    uint1024_t b_big = uint512_t(uint256_t(b));
    uint1024_t p_big = uint512_t(uint256_t(modulus));

    uint1024_t q_big = (a_big * b_big) / p_big;
    uint1024_t r_big = (a_big * b_big) % p_big;

    uint256_t q(q_big.lo.lo);
    uint256_t r(r_big.lo.lo);

    const auto split_into_limbs = [&](const uint512_t& input) {
        constexpr size_t NUM_BITS = 68;
        std::array<fr, 4> limbs;
        limbs[0] = input.slice(0, NUM_BITS).lo;
        limbs[1] = input.slice(NUM_BITS * 1, NUM_BITS * 2).lo;
        limbs[2] = input.slice(NUM_BITS * 2, NUM_BITS * 3).lo;
        limbs[3] = input.slice(NUM_BITS * 3, NUM_BITS * 4).lo;
        return limbs;
    };

    const auto get_limb_witness_indices = [&](const std::array<fr, 4>& limbs) {
        std::array<uint32_t, 4> limb_indices;
        limb_indices[0] = builder.add_variable(limbs[0]);
        limb_indices[1] = builder.add_variable(limbs[1]);
        limb_indices[2] = builder.add_variable(limbs[2]);
        limb_indices[3] = builder.add_variable(limbs[3]);
        return limb_indices;
    };
    const uint512_t BINARY_BASIS_MODULUS = uint512_t(1) << (68 * 4);
    auto modulus_limbs = split_into_limbs(BINARY_BASIS_MODULUS - uint512_t(modulus));

    const auto a_indices = get_limb_witness_indices(split_into_limbs(uint256_t(a)));
    const auto b_indices = get_limb_witness_indices(split_into_limbs(uint256_t(b)));
    const auto q_indices = get_limb_witness_indices(split_into_limbs(uint256_t(q)));
    const auto r_indices = get_limb_witness_indices(split_into_limbs(uint256_t(r)));

    non_native_multiplication_witnesses<fr> inputs{
        a_indices, b_indices, q_indices, r_indices, modulus_limbs,
    };
    const auto [lo_1_idx, hi_1_idx] = builder.evaluate_non_native_field_multiplication(inputs);
    builder.range_constrain_two_limbs(lo_1_idx, hi_1_idx, 70, 70);

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

/**
 * @brief Test that the aux block only contains aux gates.
 *
 */
TEST(UltraCircuitBuilder, NonNativeFieldMultiplicationSortCheck)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    fq a = fq::random_element();
    fq b = fq::random_element();
    uint256_t modulus = fq::modulus;

    uint1024_t a_big = uint512_t(uint256_t(a));
    uint1024_t b_big = uint512_t(uint256_t(b));
    uint1024_t p_big = uint512_t(uint256_t(modulus));

    uint1024_t q_big = (a_big * b_big) / p_big;
    uint1024_t r_big = (a_big * b_big) % p_big;

    uint256_t q(q_big.lo.lo);
    uint256_t r(r_big.lo.lo);

    const auto split_into_limbs = [&](const uint512_t& input) {
        constexpr size_t NUM_BITS = 68;
        std::array<fr, 4> limbs;
        limbs[0] = input.slice(0, NUM_BITS).lo;
        limbs[1] = input.slice(NUM_BITS * 1, NUM_BITS * 2).lo;
        limbs[2] = input.slice(NUM_BITS * 2, NUM_BITS * 3).lo;
        limbs[3] = input.slice(NUM_BITS * 3, NUM_BITS * 4).lo;
        return limbs;
    };

    const auto get_limb_witness_indices = [&](const std::array<fr, 4>& limbs) {
        std::array<uint32_t, 4> limb_indices;
        limb_indices[0] = builder.add_variable(limbs[0]);
        limb_indices[1] = builder.add_variable(limbs[1]);
        limb_indices[2] = builder.add_variable(limbs[2]);
        limb_indices[3] = builder.add_variable(limbs[3]);
        return limb_indices;
    };
    const uint512_t BINARY_BASIS_MODULUS = uint512_t(1) << (68 * 4);
    auto modulus_limbs = split_into_limbs(BINARY_BASIS_MODULUS - uint512_t(modulus));

    const auto a_indices = get_limb_witness_indices(split_into_limbs(uint256_t(a)));
    const auto b_indices = get_limb_witness_indices(split_into_limbs(uint256_t(b)));
    const auto q_indices = get_limb_witness_indices(split_into_limbs(uint256_t(q)));
    const auto r_indices = get_limb_witness_indices(split_into_limbs(uint256_t(r)));

    non_native_multiplication_witnesses<fr> inputs{
        a_indices, b_indices, q_indices, r_indices, modulus_limbs,
    };
    const auto [lo_1_idx, hi_1_idx] = builder.evaluate_non_native_field_multiplication(inputs);
    builder.range_constrain_two_limbs(lo_1_idx, hi_1_idx, 70, 70);

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);

    // Everything above was copied from the previous test.
    // Check that in the aux blocks, the other selectors besides the aux selector are zero
    for (size_t i = 0; i < builder.blocks.aux.size(); ++i) {
        EXPECT_EQ(builder.blocks.aux.q_arith()[i], 0);
        EXPECT_EQ(builder.blocks.aux.q_delta_range()[i], 0);
        EXPECT_EQ(builder.blocks.aux.q_elliptic()[i], 0);
        EXPECT_EQ(builder.blocks.aux.q_lookup_type()[i], 0);
        EXPECT_EQ(builder.blocks.aux.q_poseidon2_external()[i], 0);
        EXPECT_EQ(builder.blocks.aux.q_poseidon2_internal()[i], 0);
    }
}

TEST(UltraCircuitBuilder, Rom)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    uint32_t rom_values[8]{
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
    };

    size_t rom_id = builder.create_ROM_array(8);

    for (size_t i = 0; i < 8; ++i) {
        builder.set_ROM_element(rom_id, i, rom_values[i]);
    }

    uint32_t a_idx = builder.read_ROM_array(rom_id, builder.add_variable(5));
    EXPECT_EQ(a_idx != rom_values[5], true);
    uint32_t b_idx = builder.read_ROM_array(rom_id, builder.add_variable(4));
    uint32_t c_idx = builder.read_ROM_array(rom_id, builder.add_variable(1));

    const auto d_value = builder.get_variable(a_idx) + builder.get_variable(b_idx) + builder.get_variable(c_idx);
    uint32_t d_idx = builder.add_variable(d_value);

    builder.create_big_add_gate({
        a_idx,
        b_idx,
        c_idx,
        d_idx,
        1,
        1,
        1,
        -1,
        0,
    });

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

/**
 * @brief A simple-as-possible RAM read test, for easier debugging
 *
 */
TEST(UltraCircuitBuilder, RamSimple)
{
    UltraCircuitBuilder builder;

    // Initialize a length 1 RAM array with a single value
    fr ram_value = 5;
    uint32_t ram_value_idx = builder.add_variable(ram_value);
    size_t ram_id = builder.create_RAM_array(/*array_size=*/1);
    builder.init_RAM_element(ram_id, /*index_value=*/0, ram_value_idx);

    // Read from the RAM array we just created (at the 0th index)
    uint32_t read_idx = builder.add_variable(0);
    uint32_t a_idx = builder.read_RAM_array(ram_id, read_idx);

    // Use the result in a simple arithmetic gate
    builder.create_big_add_gate({
        a_idx,
        builder.zero_idx,
        builder.zero_idx,
        builder.zero_idx,
        -1,
        0,
        0,
        0,
        builder.get_variable(ram_value_idx),
    });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, Ram)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    uint32_t ram_values[8]{
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
    };

    size_t ram_id = builder.create_RAM_array(8);

    for (size_t i = 0; i < 8; ++i) {
        builder.init_RAM_element(ram_id, i, ram_values[i]);
    }

    uint32_t a_idx = builder.read_RAM_array(ram_id, builder.add_variable(5));
    EXPECT_EQ(a_idx != ram_values[5], true);

    uint32_t b_idx = builder.read_RAM_array(ram_id, builder.add_variable(4));
    uint32_t c_idx = builder.read_RAM_array(ram_id, builder.add_variable(1));

    builder.write_RAM_array(ram_id, builder.add_variable(4), builder.add_variable(500));
    uint32_t d_idx = builder.read_RAM_array(ram_id, builder.add_variable(4));

    EXPECT_EQ(builder.get_variable(d_idx), 500);

    // ensure these vars get used in another arithmetic gate
    const auto e_value = builder.get_variable(a_idx) + builder.get_variable(b_idx) + builder.get_variable(c_idx) +
                         builder.get_variable(d_idx);
    uint32_t e_idx = builder.add_variable(e_value);

    builder.create_big_add_gate(
        {
            a_idx,
            b_idx,
            c_idx,
            d_idx,
            -1,
            -1,
            -1,
            -1,
            0,
        },
        true);
    builder.create_big_add_gate(
        {
            builder.zero_idx,
            builder.zero_idx,
            builder.zero_idx,
            e_idx,
            0,
            0,
            0,
            0,
            0,
        },
        false);

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);

    // Test the builder copy constructor for a circuit with RAM gates
    UltraCircuitBuilder duplicate_builder{ builder };

    EXPECT_EQ(duplicate_builder.get_estimated_num_finalized_gates(), builder.get_estimated_num_finalized_gates());
    EXPECT_TRUE(CircuitChecker::check(duplicate_builder));
}

TEST(UltraCircuitBuilder, RangeChecksOnDuplicates)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();

    uint32_t a = builder.add_variable(100);
    uint32_t b = builder.add_variable(100);
    uint32_t c = builder.add_variable(100);
    uint32_t d = builder.add_variable(100);

    builder.assert_equal(a, b);
    builder.assert_equal(a, c);
    builder.assert_equal(a, d);

    builder.create_new_range_constraint(a, 1000);
    builder.create_new_range_constraint(b, 1001);
    builder.create_new_range_constraint(c, 999);
    builder.create_new_range_constraint(d, 1000);

    builder.create_big_add_gate(
        {
            a,
            b,
            c,
            d,
            0,
            0,
            0,
            0,
            0,
        },
        false);
    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TEST(UltraCircuitBuilder, CheckCircuitShowcase)
{
    UltraCircuitBuilder builder = UltraCircuitBuilder();
    // check_circuit allows us to check correctness on the go

    uint32_t a = builder.add_variable(0xdead);
    uint32_t b = builder.add_variable(0xbeef);
    // Let's create 2 gates that will bind these 2 variables to be one these two values
    builder.create_poly_gate(
        { a, a, builder.zero_idx, fr(1), -fr(0xdead) - fr(0xbeef), 0, 0, fr(0xdead) * fr(0xbeef) });
    builder.create_poly_gate(
        { b, b, builder.zero_idx, fr(1), -fr(0xdead) - fr(0xbeef), 0, 0, fr(0xdead) * fr(0xbeef) });

    // We can check if this works
    EXPECT_EQ(CircuitChecker::check(builder), true);

    // Now let's create a range constraint for b
    builder.create_new_range_constraint(b, 0xbeef);

    // We can check if this works
    EXPECT_EQ(CircuitChecker::check(builder), true);

    // But what if we now assert b to be equal to a?
    builder.assert_equal(a, b, "Oh no");

    // It fails, because a is 0xdead and it can't fit in the range constraint
    EXPECT_EQ(CircuitChecker::check(builder), false);

    // But if we force them both back to be 0xbeef...
    uint32_t c = builder.add_variable(0xbeef);
    builder.assert_equal(c, b);

    // The circuit will magically pass again
    EXPECT_EQ(CircuitChecker::check(builder), true);
}

} // namespace bb
