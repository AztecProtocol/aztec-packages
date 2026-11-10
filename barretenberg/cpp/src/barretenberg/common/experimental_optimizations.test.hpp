#pragma once

#include "experimental_optimizations.hpp"

#include <gtest/gtest.h>

namespace bb::test {

class ExperimentalOptimizationsEnvironment : public ::testing::Environment {
    void SetUp() override { initialize_experimental_optimizations(); }
};

inline const auto* experimental_optimizations_environment =
    ::testing::AddGlobalTestEnvironment(new ExperimentalOptimizationsEnvironment);

} // namespace bb::test
