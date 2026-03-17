#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <cstdint>
#include <stack>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace acir_components_count {

/**
 * @brief Builds an undirected graph on ACIR witness indices and counts connected components.
 *
 * @details Vertices are witness indices. For each ACIR constraint, all witness indices involved
 * in that constraint are connected pairwise. The number of connected components indicates how
 * many independent groups of witnesses exist at the ACIR level.
 */
class AcirGraph {
  public:
    /**
     * @brief Process all constraints in an AcirFormat, building the graph.
     */
    void process_acir_constraints(const acir_format::AcirFormat& constraints);

    /**
     * @brief Count connected components via iterative DFS.
     */
    size_t count_components() const;

  private:
    std::unordered_map<uint32_t, std::unordered_set<uint32_t>> adjacency_lists_;

    /**
     * @brief Connect all non-constant witness indices in a constraint pairwise.
     * Entries where is_constant == true are skipped.
     */
    void add_constraint(const std::vector<acir_format::WitnessOrConstant<bb::fr>>& witnesses);

    /**
     * @brief Connect all witness indices in a constraint pairwise.
     * All entries are treated as witness indices (no filtering).
     */
    void add_constraint(const std::vector<uint32_t>& indices);
};

} // namespace acir_components_count
