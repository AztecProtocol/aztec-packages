#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace bb {

static std::vector<uint32_t> add_variables(UltraCircuitBuilder& builder, const std::vector<fr>& variables)
{
    std::vector<uint32_t> res;
    for (size_t i = 0; i < variables.size(); i++) {
        res.emplace_back(builder.add_variable(variables[i]));
    }
    return res;
}

TEST(UltraCircuitBuilder, NonTrivialTagPermutation)
{
    UltraCircuitBuilder builder;
    fr a = fr::random_element();
    fr b = -a;

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(b);
    auto c_idx = builder.add_variable(b);
    auto d_idx = builder.add_variable(a);

    builder.create_add_gate({ a_idx, b_idx, builder.zero_idx(), fr::one(), fr::one(), fr::zero(), fr::zero() });
    builder.create_add_gate({ c_idx, d_idx, builder.zero_idx(), fr::one(), fr::one(), fr::zero(), fr::zero() });

    builder.create_tag(1, 2);
    builder.create_tag(2, 1);

    builder.assign_tag(a_idx, 1);
    builder.assign_tag(b_idx, 1);
    builder.assign_tag(c_idx, 2);
    builder.assign_tag(d_idx, 2);

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Break the tag
    builder.real_variable_tags[builder.real_variable_index[a_idx]] = 2;
    EXPECT_FALSE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, NonTrivialTagPermutationAndCycles)
{
    UltraCircuitBuilder builder;
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

    builder.create_add_gate({ b_idx, a_idx, builder.zero_idx(), fr::one(), fr::neg_one(), fr::zero(), fr::zero() });
    builder.create_add_gate({ c_idx, g_idx, builder.zero_idx(), fr::one(), -fr::one(), fr::zero(), fr::zero() });
    builder.create_add_gate({ e_idx, f_idx, builder.zero_idx(), fr::one(), -fr::one(), fr::zero(), fr::zero() });

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Break the tag
    builder.real_variable_tags[builder.real_variable_index[a_idx]] = 2;
    EXPECT_FALSE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, BadTagPermutation)
{
    UltraCircuitBuilder builder;
    fr a = fr::random_element();
    fr b = -a;

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(b);
    auto c_idx = builder.add_variable(b);
    auto d_idx = builder.add_variable(a + 1);

    builder.create_add_gate({ a_idx, b_idx, builder.zero_idx(), 1, 1, 0, 0 });
    builder.create_add_gate({ c_idx, d_idx, builder.zero_idx(), 1, 1, 0, -1 });

    EXPECT_TRUE(CircuitChecker::check(builder));

    builder.create_tag(1, 2);
    builder.create_tag(2, 1);

    builder.assign_tag(a_idx, 1);
    builder.assign_tag(b_idx, 1);
    builder.assign_tag(c_idx, 2);
    builder.assign_tag(d_idx, 2);

    EXPECT_FALSE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, SortWidget)
{
    UltraCircuitBuilder builder;
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(b);
    auto c_idx = builder.add_variable(c);
    auto d_idx = builder.add_variable(d);
    builder.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    EXPECT_TRUE(CircuitChecker::check(builder));
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
        EXPECT_TRUE(CircuitChecker::check(builder));
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

        EXPECT_FALSE(CircuitChecker::check(builder));
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

        EXPECT_FALSE(CircuitChecker::check(builder));
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
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto idx = add_variables(builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                            26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });
        builder.create_sort_constraint_with_edges(idx, 1, 45);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto idx = add_variables(builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                            26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });

        builder.create_sort_constraint_with_edges(idx, 1, 29);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
}

TEST(UltraCircuitBuilder, SortWidgetComplex)
{
    {

        UltraCircuitBuilder builder;
        std::vector<fr> a = { 1, 3, 4, 7, 7, 8, 11, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 };
        std::vector<uint32_t> ind;
        for (size_t i = 0; i < a.size(); i++)
            ind.emplace_back(builder.add_variable(a[i]));
        builder.create_sort_constraint(ind);

        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {

        UltraCircuitBuilder builder;
        std::vector<fr> a = { 1, 3, 4, 7, 7, 8, 16, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 };
        std::vector<uint32_t> ind;
        for (size_t i = 0; i < a.size(); i++)
            ind.emplace_back(builder.add_variable(a[i]));
        builder.create_sort_constraint(ind);

        EXPECT_FALSE(CircuitChecker::check(builder));
    }
}

TEST(UltraCircuitBuilder, SortWidgetNeg)
{
    UltraCircuitBuilder builder;
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(8);

    auto a_idx = builder.add_variable(a);
    auto b_idx = builder.add_variable(b);
    auto c_idx = builder.add_variable(c);
    auto d_idx = builder.add_variable(d);
    builder.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    EXPECT_FALSE(CircuitChecker::check(builder));
}

} // namespace bb
