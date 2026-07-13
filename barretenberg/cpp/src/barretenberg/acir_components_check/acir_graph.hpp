#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <cstdint>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace acir_components_check {

using WoC = acir_format::WitnessOrConstant<bb::fr>;

/**
 * @brief Builds an undirected graph on ACIR witness indices and finds connected components.
 *
 * @details Vertices are witness indices. Constants are filtered out. For each ACIR constraint,
 * all non-constant witness indices are connected pairwise.
 */
class AcirGraph {
  public:
    /**
     * @brief Process all constraints in an AcirFormat, building the graph.
     */
    void process_acir_constraints(const acir_format::AcirFormat& constraints);

    /**
     * @brief Get witness → component_id mapping. Component IDs are 0-based and dense.
     */
    std::unordered_map<uint32_t, size_t> get_witness_component_map() const;

  private:
    std::unordered_map<uint32_t, std::unordered_set<uint32_t>> adjacency_lists_;

    /**
     * @brief Connect all non-constant witnesses in a constraint pairwise.
     */
    void add_constraint(const std::vector<WoC>& witnesses);

    /**
     * @brief Run DFS, returning components (each as a vector of witness indices).
     */
    std::vector<std::vector<uint32_t>> find_components() const;
};

} // namespace acir_components_check
