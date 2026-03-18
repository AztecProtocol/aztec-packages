#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <cstdint>
#include <map>
#include <stack>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace acir_components_count {

using WoC = acir_format::WitnessOrConstant<bb::fr>;

/**
 * @brief Builds an undirected graph on ACIR witnesses and constants, then finds connected components.
 *
 * @details Vertices are either witness indices or constant-value IDs (assigned via value-based caching,
 * mirroring the circuit builder's put_constant_variable). For each ACIR constraint, all involved
 * witnesses and constants are connected pairwise. Shared constants merge components just like they
 * do at the circuit level.
 */
class AcirGraph {
  public:
    /**
     * @brief Must be called before process_acir_constraints to set the witness index ceiling.
     * Constant vertex IDs are allocated starting from max_witness_index + 1.
     */
    void set_max_witness_index(uint32_t max_witness_index) { next_const_id_ = max_witness_index + 1; }

    /**
     * @brief Process all constraints in an AcirFormat, building the graph.
     */
    void process_acir_constraints(const acir_format::AcirFormat& constraints);

    /**
     * @brief Get witness → component_id mapping for all witnesses that appear in the graph.
     * Only assigns component IDs to components containing at least one witness.
     * Component IDs are 0-based and dense.
     */
    std::unordered_map<uint32_t, size_t> get_witness_component_map() const;

    /**
     * @brief Count connected components that contain at least one witness vertex.
     */
    size_t count_components() const;

  private:
    std::unordered_map<uint32_t, std::unordered_set<uint32_t>> adjacency_lists_;

    // Maps constant field values to vertex IDs (mirroring circuit builder's put_constant_variable caching).
    std::map<bb::fr, uint32_t> constant_vertex_ids_;
    uint32_t next_const_id_ = 0;

    // Threshold: vertex IDs below this are witnesses, at or above are constants.
    uint32_t witness_id_ceiling_ = 0;

    /**
     * @brief Map a WitnessOrConstant to a vertex ID.
     */
    uint32_t to_vertex_id(const WoC& woc);

    /**
     * @brief Connect all witnesses/constants in a constraint pairwise.
     */
    void add_constraint(const std::vector<WoC>& witnesses);

    /**
     * @brief Run DFS, returning components (each as a vector of vertex IDs).
     * Only returns components that contain at least one witness vertex.
     */
    std::vector<std::vector<uint32_t>> find_components() const;
};

} // namespace acir_components_count
