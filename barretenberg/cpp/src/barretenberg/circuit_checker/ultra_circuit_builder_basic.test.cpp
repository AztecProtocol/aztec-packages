#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace bb {

TEST(UltraCircuitBuilder, CopyConstructor)
{
    UltraCircuitBuilder builder;

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

    EXPECT_TRUE(CircuitChecker::check(builder));

    UltraCircuitBuilder duplicate_builder{ builder };

    EXPECT_EQ(duplicate_builder.get_num_finalized_gates_inefficient(), builder.get_num_finalized_gates_inefficient());
    EXPECT_TRUE(CircuitChecker::check(duplicate_builder));
}

TEST(UltraCircuitBuilder, BaseCase)
{
    UltraCircuitBuilder builder;
    fr a = fr::one();
    builder.add_public_variable(a);
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, TestNoLookupProof)
{
    UltraCircuitBuilder builder;

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

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, CheckCircuitShowcase)
{
    UltraCircuitBuilder builder;
    // check_circuit allows us to check correctness on the go

    uint32_t a = builder.add_variable(fr(0xdead));
    uint32_t b = builder.add_variable(fr(0xbeef));
    // Let's create 2 gates that will bind these 2 variables to be one these two values
    builder.create_poly_gate(
        { a, a, builder.zero_idx(), fr(1), -fr(0xdead) - fr(0xbeef), 0, 0, fr(0xdead) * fr(0xbeef) });
    builder.create_poly_gate(
        { b, b, builder.zero_idx(), fr(1), -fr(0xdead) - fr(0xbeef), 0, 0, fr(0xdead) * fr(0xbeef) });

    // We can check if this works
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Now let's create a range constraint for b
    builder.create_new_range_constraint(b, 0xbeef);

    // We can check if this works
    EXPECT_TRUE(CircuitChecker::check(builder));

    // But what if we now assert b to be equal to a?
    builder.assert_equal(a, b, "Oh no");

    // It fails, because a is 0xdead and it can't fit in the range constraint
    EXPECT_FALSE(CircuitChecker::check(builder));

    // But if we force them both back to be 0xbeef...
    uint32_t c = builder.add_variable(fr(0xbeef));
    builder.assert_equal(c, b);

    // The circuit will magically pass again
    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace bb
