#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::testing {

std::vector<FF> random_fields(size_t n);
std::vector<uint8_t> random_bytes(size_t n);

} // namespace bb::avm2::testing
