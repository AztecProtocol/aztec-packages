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
    MSGPACK(a);
};

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
    EXPECT_EQ(msgpack::check_msgpack_method(good_example), "");
    EXPECT_EQ(msgpack::check_msgpack_method(bad_example_overlap),
              "Overlap in BadExampleOverlap MSGPACK() params detected!");
    // If we actually try to msgpack BadExampleIncomplete we will statically error
    // This is great, but we need to check the underlying facility *somehow*
    std::string incomplete_msgpack_status = "error";
    if constexpr (msgpack::MsgpackConstructible<BadExampleIncomplete>) {
        incomplete_msgpack_status = "";
    }
    EXPECT_EQ(incomplete_msgpack_status, "error");
    EXPECT_EQ(msgpack::check_msgpack_method(bad_example_out_of_object),
              "Some BadExampleOutOfObject MSGPACK() params don't exist in object!");
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
    EXPECT_EQ(
        msgpack::schema_to_string(good_example),
        "{\"__typename\":\"GoodExample\",\"a\":[\"alias\",[\"Fr\",\"bin32\"]],\"b\":[\"alias\",[\"Fr\",\"bin32\"]]}\n");
    EXPECT_EQ(msgpack::schema_to_string(complicated_schema),
              "{\"__typename\":\"ComplicatedSchema\",\"array\":[\"vector\",[[\"array\",[[\"alias\",[\"Fr\",\"bin32\"]],"
              "20]]]],\"good_or_not\":[\"optional\",[{\"__typename\":\"GoodExample\",\"a\":[\"alias\",[\"Fr\","
              "\"bin32\"]],\"b\":[\"alias\",[\"Fr\",\"bin32\"]]}]],\"bare\":[\"alias\",[\"Fr\",\"bin32\"]],\"huh\":["
              "\"variant\",[[\"alias\",[\"Fr\",\"bin32\"]],\"GoodExample\"]]}\n");
}
