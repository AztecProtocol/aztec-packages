#pragma once

#include <stdexcept>

#define EXPECT_THROW_WITH_MESSAGE(code, expectedMessage)                                                               \
    try {                                                                                                              \
        code;                                                                                                          \
        FAIL() << "Expected exception with message: " << expectedMessage;                                              \
    } catch (const std::exception& e) {                                                                                \
        EXPECT_THAT(e.what(), ::testing::ContainsRegex(expectedMessage));                                              \
    }

#define ROW_FIELD_EQ(row_id, field_name, expression) Field(#field_name, &row_id::field_name, expression)
