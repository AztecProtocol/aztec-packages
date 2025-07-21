#pragma once

#include <stdexcept>

#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

#define EXPECT_THROW_WITH_MESSAGE(code, expectedMessage)                                                               \
    try {                                                                                                              \
        code;                                                                                                          \
        FAIL() << "Expected exception with message: " << expectedMessage;                                              \
    } catch (const std::exception& e) {                                                                                \
        EXPECT_THAT(e.what(), ::testing::ContainsRegex(expectedMessage));                                              \
    }

#define ROW_FIELD_EQ(field_name, expression)                                                                           \
    ::testing::Field(#field_name, &TestTraceContainer::Row::field_name, expression)
