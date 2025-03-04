#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::testing {

std::vector<FF> random_fields(size_t n);

// WARNING: Cryptographically insecure randomness routine for testing purposes only.
std::vector<uint8_t> random_bytes(size_t n);
tracegen::TestTraceContainer empty_trace();

} // namespace bb::avm2::testing
