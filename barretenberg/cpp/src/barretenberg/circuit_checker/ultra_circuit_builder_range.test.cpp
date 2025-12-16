#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
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

TEST(UltraCircuitBuilder, RangeConstraint)
{
    {
        UltraCircuitBuilder builder;
        auto indices = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 8);
        }
        builder.create_sort_constraint(indices);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices = add_variables(builder, { 3 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 3);
        }
        builder.create_unconstrained_gates(indices);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices = add_variables(builder, { 1, 2, 3, 4, 5, 6, 8, 25 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 8);
        }
        builder.create_sort_constraint(indices);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices =
            add_variables(builder, { 1, 2, 3, 4, 5, 6, 10, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 19, 51 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 128);
        }
        builder.create_unconstrained_gates(indices);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices =
            add_variables(builder, { 1, 2, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 79);
        }
        builder.create_unconstrained_gates(indices);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices =
            add_variables(builder, { 1, 0, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_new_range_constraint(indices[i], 79);
        }
        builder.create_unconstrained_gates(indices);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
}

TEST(UltraCircuitBuilder, RangeWithGates)
{
    UltraCircuitBuilder builder;
    auto idx = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        builder.create_new_range_constraint(idx[i], 8);
    }

    builder.create_add_gate({ idx[0], idx[1], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -3 });
    builder.create_add_gate({ idx[2], idx[3], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -7 });
    builder.create_add_gate({ idx[4], idx[5], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -11 });
    builder.create_add_gate({ idx[6], idx[7], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -15 });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, RangeWithGatesWhereRangeIsNotAPowerOfTwo)
{
    UltraCircuitBuilder builder;
    auto idx = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        builder.create_new_range_constraint(idx[i], 12);
    }

    builder.create_add_gate({ idx[0], idx[1], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -3 });
    builder.create_add_gate({ idx[2], idx[3], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -7 });
    builder.create_add_gate({ idx[4], idx[5], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -11 });
    builder.create_add_gate({ idx[6], idx[7], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -15 });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, ComposedRangeConstraint)
{
    // even num bits - not divisible by 3
    UltraCircuitBuilder builder;
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 133);
    auto e = fr(d);
    auto a_idx = builder.add_variable(fr(e));
    builder.create_add_gate({ a_idx, builder.zero_idx(), builder.zero_idx(), 1, 0, 0, -fr(e) });
    builder.decompose_into_default_range(a_idx, 134);

    // odd num bits - divisible by 3
    auto c_1 = fr::random_element();
    auto d_1 = uint256_t(c_1).slice(0, 126);
    auto e_1 = fr(d_1);
    auto a_idx_1 = builder.add_variable(fr(e_1));
    builder.create_add_gate({ a_idx_1, builder.zero_idx(), builder.zero_idx(), 1, 0, 0, -fr(e_1) });
    builder.decompose_into_default_range(a_idx_1, 127);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, RangeChecksOnDuplicates)
{
    UltraCircuitBuilder builder;

    uint32_t a = builder.add_variable(fr(100));
    uint32_t b = builder.add_variable(fr(100));
    uint32_t c = builder.add_variable(fr(100));
    uint32_t d = builder.add_variable(fr(100));

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
    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace bb
