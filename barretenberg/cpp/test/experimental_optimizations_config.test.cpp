#include "barretenberg/common/experimental_optimizations.hpp"

#include <cstdlib>
#include <gtest/gtest.h>

#if !defined(__wasm__) && !defined(_WIN32)
TEST(ExperimentalOptimizations, DefaultsOff)
{
    EXPECT_EXIT(
        {
            unsetenv("BB_EXPERIMENTAL_OPTIMIZATIONS");
            bb::initialize_experimental_optimizations();
            std::_Exit(bb::experimental_optimizations_enabled() ? 1 : 0);
        },
        ::testing::ExitedWithCode(0),
        "");
}

TEST(ExperimentalOptimizations, FreezesEnvironment)
{
    EXPECT_EXIT(
        {
            setenv("BB_EXPERIMENTAL_OPTIMIZATIONS", "1", 1);
            bb::initialize_experimental_optimizations();
            setenv("BB_EXPERIMENTAL_OPTIMIZATIONS", "0", 1);
            bb::initialize_experimental_optimizations();
            std::_Exit(bb::experimental_optimizations_enabled() ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
}

TEST(ExperimentalOptimizations, RejectsInvalidEnvironment)
{
#ifdef BB_NO_EXCEPTIONS
    EXPECT_DEATH(
        {
            setenv("BB_EXPERIMENTAL_OPTIMIZATIONS", "invalid", 1);
            bb::initialize_experimental_optimizations();
        },
        "BB_EXPERIMENTAL_OPTIMIZATIONS must be 0 or 1");
#else
    setenv("BB_EXPERIMENTAL_OPTIMIZATIONS", "invalid", 1);
    EXPECT_THROW(bb::initialize_experimental_optimizations(), std::runtime_error);
    unsetenv("BB_EXPERIMENTAL_OPTIMIZATIONS");
#endif
}

TEST(RollupExperimentalOptimizations, DefaultsOffAndIndependent)
{
    EXPECT_EXIT(
        {
            setenv("BB_EXPERIMENTAL_OPTIMIZATIONS", "1", 1);
            unsetenv("ROLLUP_EXPERIMENTAL_OPTIMIZATIONS");
            bb::initialize_experimental_optimizations();
            std::_Exit(
                bb::experimental_optimizations_enabled() && !bb::rollup_experimental_optimizations_enabled() ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
}

TEST(RollupExperimentalOptimizations, FreezesIndependently)
{
    EXPECT_EXIT(
        {
            setenv("BB_EXPERIMENTAL_OPTIMIZATIONS", "0", 1);
            setenv("ROLLUP_EXPERIMENTAL_OPTIMIZATIONS", "1", 1);
            bb::initialize_experimental_optimizations();
            setenv("ROLLUP_EXPERIMENTAL_OPTIMIZATIONS", "0", 1);
            bb::initialize_experimental_optimizations();
            std::_Exit(
                !bb::experimental_optimizations_enabled() && bb::rollup_experimental_optimizations_enabled() ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
}

TEST(RollupExperimentalOptimizations, RejectsInvalidEnvironment)
{
#ifdef BB_NO_EXCEPTIONS
    EXPECT_DEATH(
        {
            setenv("ROLLUP_EXPERIMENTAL_OPTIMIZATIONS", "true", 1);
            bb::initialize_experimental_optimizations();
        },
        "ROLLUP_EXPERIMENTAL_OPTIMIZATIONS must be 0 or 1");
#else
    setenv("ROLLUP_EXPERIMENTAL_OPTIMIZATIONS", "true", 1);
    EXPECT_THROW(bb::initialize_experimental_optimizations(), std::runtime_error);
    unsetenv("ROLLUP_EXPERIMENTAL_OPTIMIZATIONS");
#endif
}

#endif
