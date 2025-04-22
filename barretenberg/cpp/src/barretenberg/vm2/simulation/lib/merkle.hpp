#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

FF root_from_path(const FF& leaf_value, const uint64_t leaf_index, std::span<const FF> path);

} // namespace bb::avm2::simulation
