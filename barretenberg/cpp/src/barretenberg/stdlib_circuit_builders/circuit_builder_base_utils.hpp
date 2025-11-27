#pragma once
#include <cstdint>
#include <unordered_set>
#include <vector>

namespace bb {

template <typename Builder> std::unordered_set<uint32_t> get_real_variable_indices_set(const Builder& builder);

template <typename Builder>
std::unordered_set<uint32_t> get_difference_real_variable_indices_states(const std::unordered_set<uint32_t>& fst_state, const Builder& builder);
} // namespace bb
