// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "acir_format.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/honk/execution_trace/gate_data.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <vector>

namespace acir_format {

template <typename Builder>
void create_big_quad_constraint(Builder& builder, std::vector<bb::mul_quad_<typename Builder::FF>>& big_constraint);

} // namespace acir_format
