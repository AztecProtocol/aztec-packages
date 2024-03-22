#include "test_values.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace smt_circuit;

using bool_ct = stdlib::bool_t<StandardCircuitBuilder>;
using witness_ct = stdlib::witness_t<StandardCircuitBuilder>;
using byte_array_ct = stdlib::byte_array<StandardCircuitBuilder>;
using uint_ct = stdlib::uint32<StandardCircuitBuilder>;

TEST(uint, add_unique_output_check_via_builder)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, 0);
    uint_ct b = witness_ct(&builder, 0);
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a + b;
    builder.set_variable_name(c.get_witness_index(), "c");

    for (size_t i = 0; i < builder.get_num_variables(); i++) {
        builder.variables[i] = add_unique_output[i][0];
    }
    ASSERT_TRUE(CircuitChecker::check(builder));
}

TEST(uint, add_unique_witness_check_via_builder)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, 0);
    uint_ct b = witness_ct(&builder, 0);
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a + b;
    builder.set_variable_name(c.get_witness_index(), "c");

    for (size_t i = 0; i < builder.get_num_variables(); i++) {
        builder.variables[i] = add_unique_witness[i][0];
    }
    ASSERT_TRUE(CircuitChecker::check(builder));
}

TEST(uint, add_unique_witness2_check_via_builder)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, 0);
    uint_ct b = witness_ct(&builder, 0);
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a + b;
    builder.set_variable_name(c.get_witness_index(), "c");

    for (size_t i = 0; i < builder.get_num_variables(); i++) {
        builder.variables[i] = add_unique_witness2[i][0];
    }
    ASSERT_TRUE(CircuitChecker::check(builder));
}

TEST(uint, add_arithmetic_patch_check1)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(fr::random_element()));

    uint_ct c = a + b;

    bb::fr new_c;
    bb::fr d = builder.variables[131];
    bb::fr initial_c = c.get_value();

    if (d == 0) {
        new_c = initial_c - bb::fr(2).pow(32);
        builder.variables[130] = new_c;
        builder.variables[131] = 1;
        builder.variables[133] = 0;
        ASSERT_TRUE(CircuitChecker::check(builder));

        new_c = initial_c - bb::fr(2).pow(33);
        builder.variables[130] = new_c;
        builder.variables[131] = 2;
        builder.variables[133] = 2;
        ASSERT_TRUE(CircuitChecker::check(builder));
    } else if (d == 1) {
        new_c = initial_c - bb::fr(2).pow(32);
        builder.variables[130] = new_c;
        builder.variables[131] = 2;
        builder.variables[133] = 2;
        ASSERT_TRUE(CircuitChecker::check(builder));

        new_c = initial_c + bb::fr(2).pow(32);
        builder.variables[130] = new_c;
        builder.variables[131] = 0;
        builder.variables[133] = 0;
        ASSERT_TRUE(CircuitChecker::check(builder));
    } else if (d == 2) {
        new_c = initial_c + bb::fr(2).pow(32);
        builder.variables[130] = new_c;
        builder.variables[131] = 1;
        builder.variables[133] = 0;
        ASSERT_TRUE(CircuitChecker::check(builder));

        new_c = initial_c + bb::fr(2).pow(33);
        builder.variables[130] = new_c;
        builder.variables[131] = 0;
        builder.variables[133] = 0;
        ASSERT_TRUE(CircuitChecker::check(builder));
    }

    info(builder.variables[a.get_witness_index()]);
    info(" + ");
    info(builder.variables[b.get_witness_index()]);
    info("=");
    info(builder.variables[c.get_witness_index()]);
    info("and always has been...");
}