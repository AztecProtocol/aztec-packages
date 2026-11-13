#include "barretenberg/common/experimental_optimizations.hpp"

#include <cstdlib>
#include <gtest/gtest.h>
#include <string_view>

TEST(ExperimentalOptimizationsStartup, UsesRequestedEnvironment)
{
    const auto requested = [](const char* name) {
        const char* value = std::getenv(name);
        return value != nullptr && std::string_view(value) == "1";
    };
    EXPECT_EQ(bb::experimental_optimizations_enabled(), requested("BB_EXPERIMENTAL_OPTIMIZATIONS"));
}
