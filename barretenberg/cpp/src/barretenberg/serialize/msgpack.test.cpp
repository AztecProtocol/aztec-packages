#include "barretenberg/serialize/msgpack.hpp"

#include <gtest/gtest.h>

// Mostly to be sure the function is constexpr.
static_assert(::msgpack_detail::camel_case("gas_used") == "gasUsed");

TEST(MsgpackSerialize, CamelCase)
{
    EXPECT_EQ(::msgpack_detail::camel_case("gas_used"), "gasUsed");
}
