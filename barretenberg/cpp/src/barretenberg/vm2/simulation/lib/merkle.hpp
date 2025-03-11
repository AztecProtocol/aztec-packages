#include "barretenberg/vm2/common/field.hpp"
#include <cstdint>

namespace bb::avm2::simulation {

FF root_from_path(const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path);

} // namespace bb::avm2::simulation
