#pragma once

#include <stdexcept>

#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

#define ROW_FIELD_EQ(field_name, expression)                                                                           \
    ::testing::Field(#field_name, &TestTraceContainer::Row::field_name, expression)
