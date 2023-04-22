#include <barretenberg/stdlib/merkle_tree/membership.hpp>
#include <barretenberg/numeric/random/engine.hpp>
#include <barretenberg/msgpack/msgpack_nvp_macro.h>
#include <aztec3/msgpack/msgpack_test.hpp>
#include <aztec3/msgpack/msgpack_schema_impl.hpp>

#include <gtest/gtest.h>

// Sanity checking for msgpack
// TODO eventually move to barretenberg
struct GoodExample {
    fr a;
    fr b;
    void msgpack_flat(auto ar) { ar(a, b); }
} good_example;

struct BadExampleOverlap {
    fr a;
    fr b;
    void msgpack_flat(auto ar) { ar(a, a); }
} bad_example_overlap;

struct BadExampleIncomplete {
    fr a;
    fr b;
    void msgpack_flat(auto ar) { ar(a); }
} bad_example_incomplete;

struct BadExampleOutOfObject {
    fr a;
    fr b;
    void msgpack_flat(auto ar)
    {
        BadExampleOutOfObject other_object;
        ar(other_object.a, other_object.b);
    }
} bad_example_out_of_object;

// TODO eventually move to barretenberg
TEST(abi_tests, msgpack_sanity_sanity)
{
    good_example.msgpack_flat(
        [&](auto&... args) { EXPECT_EQ(msgpack::check_memory_span(&good_example, &args...), ""); });
    bad_example_overlap.msgpack_flat([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_overlap, &args...),
                  "Overlap in BadExampleOverlap ar() params detected!");
    });
    bad_example_incomplete.msgpack_flat([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_incomplete, &args...),
                  "Incomplete BadExampleIncomplete ar() params! Not all of object specified.");
    });
    bad_example_out_of_object.msgpack_flat([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_out_of_object, &args...),
                  "Some BadExampleOutOfObject ar() params don't exist in object!");
    });
}

struct ComplicatedSchema {
    std::vector<std::array<fr, 20>> array;
    std::optional<GoodExample> good_or_not;
    fr bare;
    std::variant<fr, GoodExample> huh;
    void msgpack(auto ar) { ar(NVP(array, good_or_not, bare, huh)); }
} complicated_schema;

TEST(abi_tests, msgpack_schema_sanity)
{
    EXPECT_EQ(msgpack::schema_to_string(good_example), "[\"GoodExample\",\"field\",\"field\"]\n");
    EXPECT_EQ(msgpack::schema_to_string(complicated_schema),
              "{\"__typename\":\"ComplicatedSchema\",\"array\":[\"vector\",\"array\"],\"good_or_not\":[\"optional\",["
              "\"GoodExample\",\"field\",\"field\"]],\"bare\":\"field\",\"huh\":[\"variant\",\"field\",["
              "\"GoodExample\",\"field\",\"field\"]]}\n");
}