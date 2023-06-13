#include "dynamic_array.hpp"

#include <gtest/gtest.h>

#include "barretenberg/numeric/random/engine.hpp"

#include "../bool/bool.hpp"
#include "../composers/composers.hpp"

namespace test_stdlib_dynamic_array {
using namespace barretenberg;
using namespace proof_system::plonk;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

// Defining ultra-specific types for local testing.
using Composer = proof_system::UltraCircuitConstructor;
using bool_ct = stdlib::bool_t<Composer>;
using field_ct = stdlib::field_t<Composer>;
using witness_ct = stdlib::witness_t<Composer>;
using DynamicArray_ct = stdlib::DynamicArray<Composer>;

TEST(DynamicArray, DynamicArrayReadWriteConsistency)
{

    Composer composer;
    const size_t max_size = 10;

    DynamicArray_ct array(&composer, max_size);

    for (size_t i = 0; i < max_size; ++i) {
        array.push(field_ct::from_witness(&composer, i));
        EXPECT_EQ(array.read(i).get_value(), i);
    }

    EXPECT_EQ(array.native_size(), max_size);
    for (size_t i = 0; i < max_size; ++i) {
        array.pop();
    }
    EXPECT_EQ(array.native_size(), 0);

    array.resize(max_size - 1, 7);

    EXPECT_EQ(array.native_size(), max_size - 1);
    for (size_t i = 0; i < max_size - 1; ++i) {
        EXPECT_EQ(array.read(i).get_value(), 7);
    }

    array.conditional_push(false, 100);
    EXPECT_EQ(array.native_size(), max_size - 1);

    array.conditional_push(true, 100);
    EXPECT_EQ(array.native_size(), max_size);
    EXPECT_EQ(array.read(max_size - 1).get_value(), 100);

    array.conditional_pop(false);
    EXPECT_EQ(array.native_size(), max_size);

    array.conditional_pop(true);
    EXPECT_EQ(array.native_size(), max_size - 1);

    bool verified = composer.check_circuit();
    EXPECT_EQ(verified, true);
}

} // namespace test_stdlib_dynamic_array