#include <barretenberg/stdlib/merkle_tree/membership.hpp>
#include <barretenberg/numeric/random/engine.hpp>
#include <barretenberg/common/msgpack.hpp>
#include "aztec3/msgpack/check_memory_span.hpp"
#include "aztec3/msgpack/schema_impl.hpp"

#include <gtest/gtest.h>

// Sanity checking for msgpack
// TODO eventually move to barretenberg

struct GoodExample {
    fr a;
    fr b;
    MSGPACK(a, b);
} good_example;

struct BadExampleOverlap {
    fr a;
    fr b;
    MSGPACK(a, a);
} bad_example_overlap;

struct BadExampleIncomplete {
    fr a;
    fr b;
    MSGPACK(a, b);
} bad_example_incomplete;

struct BadExampleOutOfObject {
    fr a;
    fr b;
    void msgpack(auto ar)
    {
        BadExampleOutOfObject other_object;
        ar("a", other_object.a, "b", other_object.b);
    }
} bad_example_out_of_object;

// TODO eventually move to barretenberg
TEST(abi_tests, msgpack_sanity_sanity)
{
    good_example.msgpack([&](auto&... args) { EXPECT_EQ(msgpack::check_memory_span(&good_example, &args...), ""); });
    bad_example_overlap.msgpack([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_overlap, &args...),
                  "Overlap in BadExampleOverlap MSGPACK() params detected!");
    });
    bad_example_incomplete.msgpack([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_incomplete, &args...),
                  "Incomplete BadExampleIncomplete MSGPACK() params! Not all of object specified.");
    });
    bad_example_out_of_object.msgpack([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_out_of_object, &args...),
                  "Some BadExampleOutOfObject MSGPACK() params don't exist in object!");
    });
}

struct ComplicatedSchema {
    std::vector<std::array<fr, 20>> array;
    std::optional<GoodExample> good_or_not;
    fr bare;
    std::variant<fr, GoodExample> huh;
    MSGPACK(array, good_or_not, bare, huh);
} complicated_schema;

TEST(abi_tests, msgpack_schema_sanity)
{
    EXPECT_EQ(msgpack::schema_to_string(good_example), "[\"GoodExample\",\"field\",\"field\"]\n");
    EXPECT_EQ(msgpack::schema_to_string(complicated_schema),
              "{\"__typename\":\"ComplicatedSchema\",\"array\":[\"vector\",\"array\"],\"good_or_not\":[\"optional\",["
              "\"GoodExample\",[\"struct\",\"field\",\"bin32\"],\"field\"]],\"bare\":\"field\",\"huh\":[\"variant\","
              "\"field\",\"GoodExample\"]}\n");
}
