// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <cstdint>
#include <utility>
#include <vector>

namespace acir_format {

/**
 * @brief Utility class for tracking the gate count of acir constraints
 *
 */
template <typename Builder> class GateCounter {
  public:
    GateCounter(Builder* builder, bool collect_gates_per_opcode)
        : builder(builder)
        , collect_gates_per_opcode(collect_gates_per_opcode)
    {}

    size_t compute_diff()
    {
        if (!collect_gates_per_opcode) {
            return 0;
        }
        size_t new_gate_count = builder->get_num_finalized_gates_inefficient(/*ensure_nonzero=*/false);
        size_t diff = new_gate_count - prev_gate_count;
        prev_gate_count = new_gate_count;
        return diff;
    }

    void track_diff(std::vector<size_t>& gates_per_opcode, size_t opcode_index)
    {
        if (collect_gates_per_opcode) {
            gates_per_opcode[opcode_index] = compute_diff();
        }
    }

  private:
    Builder* builder;
    bool collect_gates_per_opcode;
    size_t prev_gate_count{};
};
} // namespace acir_format
