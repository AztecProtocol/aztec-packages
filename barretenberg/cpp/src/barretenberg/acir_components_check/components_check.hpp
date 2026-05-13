#pragma once
#include "acir_graph.hpp"
#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include <cstdint>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace Acir {
struct Circuit;
}

/**
 * \brief Validates that ACIR witness connectivity (from the Noir circuit) matches circuit variable
 *        connectivity after `create_circuit`.
 *
 * \details Pipeline:
 * - **ACIR side** — `AcirGraph` connects witnesses that appear together in the same opcode
 *   (assert-zero, black-box calls, memory block), then takes connected components ("ACIR components").
 * - **Circuit side** — `cdg::StaticAnalyzer_<bb::fr, Builder>` finds connected components on the
 *   built circuit. Witness indices are mapped through `real_variable_index` to real variables.
 * - **Classification** — Witnesses not in a multi-variable CC may still be valid if they are
 *   constants, range-list-only, or singleton variables (gates but degree-0 in the CC graph); those
 *   get synthetic "virtual" component ids to avoid spurious SPLIT. Otherwise `NO_CIRCUIT_CC`.
 * - **Compare** — For each ACIR component, all witnesses must share one (real or virtual) circuit
 *   component id, and none may be `NO_CIRCUIT_CC`.
 */
namespace acir_components_check {

/** Single structural violation reported by `ComponentsChecker_`. */
struct Error {
    enum class Type {
        /** Same ACIR component maps to more than one circuit connected component. */
        SPLIT,
        /** At least one witness in the ACIR component has no circuit placement (not in a CC,
         *  not classified as constant/singleton/range-list). */
        UNCONSTRAINED
    };
    /** Which of the two failure modes applies. */
    Type type;
    /** ACIR component id (from `AcirGraph::get_witness_component_map`). */
    size_t acir_component;
    /** Human-readable explanation (may list witness indices and circuit CC ids). */
    std::string message;
};

/**
 * @brief Structural comparison between ACIR-level and circuit-level connected components.
 *
 * @details Verifies that every pair of ACIR witnesses in the same ACIR component maps to the
 * same circuit component. Detects two kinds of errors:
 *   - SPLIT: An ACIR component's witnesses are spread across multiple circuit components.
 *   - UNCONSTRAINED: An ACIR component has witnesses that don't appear in any circuit constraint.
 *
 * Templated on `Builder` (typically `bb::UltraCircuitBuilder` or `bb::MegaCircuitBuilder`). The
 * builder type must expose `real_variable_index`, `range_lists`, and `constant_variable_indices`
 * (both Ultra and Mega satisfy this since `MegaCircuitBuilder_` inherits from `UltraCircuitBuilder_`).
 *
 * The constructor takes the raw `Acir::Circuit` used for `AcirGraph` and the builder produced by
 * `create_circuit` for the same program; both must stay valid through `check()`.
 */
template <typename Builder> class ComponentsChecker_ {
  public:
    ComponentsChecker_(const Acir::Circuit& acir_circuit, Builder& builder)
        : acir_circuit_(acir_circuit)
        , builder_(builder)
    {}

    /**
     * @brief Run the full check. Returns list of errors (empty = pass).
     */
    std::vector<Error> check();

  private:
    const Acir::Circuit& acir_circuit_;
    Builder& builder_;

    /// ACIR witness index → id of its connected component in `AcirGraph`.
    std::unordered_map<uint32_t, size_t> acir_witness_map_;

    /// ACIR witness index → circuit-side component id (real CC from analyzer, virtual id for
    /// constants/singletons, or sentinel meaning "no circuit role" — see `.cpp`).
    std::unordered_map<uint32_t, size_t> circuit_witness_map_;

    /// Real circuit variable index → connected component id from the static analyzer.
    std::unordered_map<uint32_t, size_t> circuit_var_to_cc_;

    /// `builder.constant_variable_indices`: real variables that represent compile-time constants.
    std::unordered_set<uint32_t> constant_var_set_;

    /// Real variables referenced from `builder.range_lists` (delta-range / lookup plumbing).
    std::unordered_set<uint32_t> range_list_vars_;

    /// Per-variable gate participation counts from the analyzer (detects singletons).
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

/// Default alias for callers that work with `UltraCircuitBuilder`.
using ComponentsChecker = ComponentsChecker_<bb::UltraCircuitBuilder>;
using UltraComponentsChecker = ComponentsChecker_<bb::UltraCircuitBuilder>;
using MegaComponentsChecker = ComponentsChecker_<bb::MegaCircuitBuilder>;

} // namespace acir_components_check
