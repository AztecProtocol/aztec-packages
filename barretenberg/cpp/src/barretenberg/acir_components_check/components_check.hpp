#pragma once
#include "acir_graph.hpp"
#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include <cstdint>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace acir_components_check {

struct Error {
    enum class Type { SPLIT, UNCONSTRAINED };
    Type type;
    size_t acir_component;
    std::string message;
};

/**
 * @brief Structural comparison between ACIR-level and circuit-level connected components.
 *
 * @details Verifies that every pair of ACIR witnesses in the same ACIR component maps to the
 * same circuit component. Detects two kinds of errors:
 *   - SPLIT: An ACIR component's witnesses are spread across multiple circuit components.
 *   - UNCONSTRAINED: An ACIR component has witnesses that don't appear in any circuit constraint.
 */
class ComponentsChecker {
  public:
    ComponentsChecker(const acir_format::AcirFormat& constraints, bb::UltraCircuitBuilder& builder)
        : constraints_(constraints)
        , builder_(builder)
        , max_witness_(constraints.max_witness_index)
    {}

    /**
     * @brief Run the full check. Returns list of errors (empty = pass).
     */
    std::vector<Error> check();

  private:
    const acir_format::AcirFormat& constraints_;
    bb::UltraCircuitBuilder& builder_;
    uint32_t max_witness_;

    // ACIR witness → ACIR component id
    std::unordered_map<uint32_t, size_t> acir_witness_map_;

    // ACIR witness → circuit component id (real CC, virtual singleton/constant, or NO_CIRCUIT_CC)
    std::unordered_map<uint32_t, size_t> circuit_witness_map_;

    // Circuit variable → CC index (from analyzer)
    std::unordered_map<uint32_t, size_t> circuit_var_to_cc_;

    // Constant variable indices (from put_constant_variable cache)
    std::unordered_set<uint32_t> constant_var_set_;

    // Variables in range_lists (pending delta_range gates)
    std::unordered_set<uint32_t> range_list_vars_;

    // Gate counts from the analyzer
    std::unordered_map<uint32_t, size_t> gate_counts_;

    /**
     * @brief Build ACIR-level witness → component mapping.
     */
    void build_acir_component_map();

    /**
     * @brief Build circuit-level witness → component mapping.
     * Runs the static analyzer, then classifies each ACIR witness as:
     *   - in a real CC (from the analyzer)
     *   - mapped to a constant variable
     *   - a singleton (in a gate or range_list but degree-0)
     *   - unconstrained (none of the above)
     */
    void build_circuit_component_map();

    /**
     * @brief Compare the two maps structurally.
     */
    std::vector<Error> compare_components() const;

    /**
     * @brief Format details about an unconstrained witness for error reporting.
     */
    std::string format_witness_debug(uint32_t witness_idx) const;
};

} // namespace acir_components_check
