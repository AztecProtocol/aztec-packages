#include "dynamic_array.hpp"

#include <gtest/gtest.h>

#include "barretenberg/numeric/random/engine.hpp"

#include "../bool/bool.hpp"
#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

// Defining ultra-specific types for local testing.
using Builder = UltraCircuitBuilder;
using bool_ct = stdlib::bool_t<Builder>;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using DynamicArray_ct = stdlib::DynamicArray<Builder>;

STANDARD_TESTING_TAGS

/**
 * @brief Check that tags in Dynamic array are propagated correctly
 *
 */
TEST(DynamicArray, TagCorrectness)
{

    Builder builder;
    const size_t max_size = 4;

    DynamicArray_ct array(&builder, max_size);

    // Create random entries
    field_ct entry_1 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_2 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_3 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_4 = witness_ct(&builder, bb::fr::random_element());

    // Assign a different tag to each entry
    entry_1.set_origin_tag(submitted_value_origin_tag);
    entry_2.set_origin_tag(challenge_origin_tag);
    entry_3.set_origin_tag(next_challenge_tag);
    // Entry 4 has an "instant death" tag, that triggers an exception when merged with another tag
    entry_4.set_origin_tag(instant_death_tag);

    // Fill out the dynamic array with the first 3 entries
    array.push(entry_1);
    array.push(entry_2);
    array.push(entry_3);

    // Check that the tags are preserved
    EXPECT_EQ(array.read(1).get_origin_tag(), challenge_origin_tag);
    EXPECT_EQ(array.read(2).get_origin_tag(), next_challenge_tag);
    EXPECT_EQ(array.read(0).get_origin_tag(), submitted_value_origin_tag);
    // Update an element of the array
    array.write(0, entry_2);
    // Check that the tag changed
    EXPECT_EQ(array.read(0).get_origin_tag(), challenge_origin_tag);

#ifndef NDEBUG
    // Check that "instant death" happens when an "instant death"-tagged element is taken from the array and added to
    // another one
    array.pop();
    array.pop();
    array.push(entry_4);
    array.push(entry_2);
    array.push(entry_3);

    EXPECT_THROW(array.read(witness_ct(&builder, 1)) + array.read(witness_ct(&builder, 2)), std::runtime_error);
#endif
}

TEST(DynamicArray, DynamicArrayReadWriteConsistency)
{

    Builder builder;
    const size_t max_size = 10;

    DynamicArray_ct array(&builder, max_size);

    for (size_t i = 0; i < max_size; ++i) {
        array.push(field_ct::from_witness(&builder, i));
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

    bool verified = CircuitChecker::check(builder);
    EXPECT_EQ(verified, true);
}
