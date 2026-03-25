#pragma once
#include <cstdint>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace Acir {
/**
 * Forward declaration only: pulling in the full generated `acir.hpp` here would compile a very
 * large header graph and currently trips `-Wunused-parameter` on generated code. Implementations
 * include `acir_to_constraint_buf.hpp` where the full `Circuit` layout is required.
 */
struct Circuit;
} // namespace Acir

namespace acir_components_check {

/**
 * @brief Undirected graph on ACIR witness indices; connected components = "ACIR components".
 *
 * @details Vertices are witness indices (Noir/ACIR numbering). Each opcode contributes one
 * hyperedge: every witness that appears in that opcode is pairwise-adjacent, so the component
 * captures "must be wired together at the ACIR level".
 *
 * Opcode coverage matches the structural links we care about for debugging serde/synthesis:
 * `AssertZero`, black-box calls (witness inputs/outputs only — constants are skipped by collectors),
 * and memory blocks (`MemoryInit` / `MemoryOp` per block, merged into one edge set per block).
 * `BrilligCall` and `Call` add no edges (Brillig is unconstrained ACIR; calls are not expanded here).
 */
class AcirGraph {
  public:
    /**
     * @brief Walk `circuit.opcodes`, populate adjacency, then merge per-block memory witnesses.
     */
    void process_acir_circuit(const Acir::Circuit& circuit);

    /**
     * @brief Map each witness that appears in at least one edge to a component id.
     *
     * @details IDs are `0 .. N-1` where `N` is the number of connected components in iteration
     * order over `adjacency_lists_` (order is deterministic for a given graph build, but not
     * semantically meaningful). Isolated witnesses (never referenced) do not appear in the map.
     */
    std::unordered_map<uint32_t, size_t> get_witness_component_map() const;

  private:
    std::unordered_map<uint32_t, std::unordered_set<uint32_t>> adjacency_lists_;

    /**
     * @brief Add a clique on the given witness indices (deduplicated). Empty or singleton → no edges.
     */
    void add_constraint(const std::vector<uint32_t>& witnesses);

    /**
     * @brief Iterative DFS over `adjacency_lists_`; each inner vector is one component's vertices.
     */
    std::vector<std::vector<uint32_t>> find_components() const;
};

} // namespace acir_components_check
