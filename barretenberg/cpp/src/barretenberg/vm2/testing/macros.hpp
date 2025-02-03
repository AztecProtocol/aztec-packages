#pragma once

#include <stdexcept>

#define EXPECT_THROW_WITH_MESSAGE(code, expectedMessage)                                                               \
    try {                                                                                                              \
        code;                                                                                                          \
        FAIL() << "Expected exception with message: " << expectedMessage;                                              \
    } catch (const std::exception& e) {                                                                                \
        EXPECT_THAT(e.what(), testing::ContainsRegex(expectedMessage));                                                \
    }
