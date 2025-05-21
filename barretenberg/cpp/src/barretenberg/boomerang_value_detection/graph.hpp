#pragma once
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <list>
#include <set>
#include <typeinfo>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace cdg {

using UltraBlock = bb::UltraTraceBlock;
/**
 * We've added a new feature to the static analyzer that tracks which gates contain each variable.
 * This is helpful for removing false-positive variables from the analyzer by using gate selectors
 * combined with additional knowledge about variables (e.g., tau or range tags).
 *
 * This information is stored in an unordered map with keys of type std::pair<uint32_t, size_t>, where:
 * - uint32_t represents the real variable index
 * - size_t represents the index of the UltraTraceBlock in the reference array of TraceBlocks
 *   contained within the Ultra Circuit Builder
 *
 * Since std::unordered_map doesn't provide default hash and equality functions for std::pair keys,
 * we've implemented these ourselves. Our approach is based on the hash_combine function from the
 * Boost library, which efficiently combines hashes of the two elements in the pair.
 */
using KeyPair = std::pair<uint32_t, size_t>;

struct KeyHasher {
    size_t operator()(const KeyPair& pair) const
    {
        size_t combined_hash = 0;
        // Golden ratio constant (2^32 / phi) used in hash combining for better distribution
        constexpr size_t HASH_COMBINE_CONSTANT = 0x9e3779b9;
        auto hash_combiner = [](size_t lhs, size_t rhs) {
            return lhs ^ (rhs + HASH_COMBINE_CONSTANT + (lhs << 6) + (lhs >> 2));
        };
        combined_hash = hash_combiner(combined_hash, std::hash<uint32_t>()(pair.first));
        combined_hash = hash_combiner(combined_hash, std::hash<size_t>()(pair.second));
        return combined_hash;
    }
};

struct KeyEquals {
    bool operator()(const KeyPair& p1, const KeyPair& p2) const
    {
        return (p1.first == p2.first && p1.second == p2.second);
    }
};

/*
 * This class describes an arithmetic circuit as an undirected graph, where vertices are variables from the circuit.
 * Edges describe connections between variables through gates. We want to find variables that weren't properly
 * constrained or where some connections were missed using additional metrics, such as how many gates a variable appears
 * in and the number of connected components in the graph. If a variable appears in only one gate, it means that this
 * variable wasn't constrained properly. If the number of connected components > 1, it means that there were some missed
 * connections between variables.
 */
template <typename FF> class Graph_ {
  public:
    Graph_() = default;
    Graph_(const Graph_& other) = delete;
    Graph_(Graph_&& other) = delete;
    Graph_& operator=(const Graph_& other) = delete;
    Graph_&& operator=(Graph_&& other) = delete;
    Graph_(bb::UltraCircuitBuilder& ultra_circuit_constructor);

    /**
     * @brief Convert a vector of variable indices to their real indices
     * @param ultra_circuit_constructor The UltraCircuitBuilder instance
     * @param variable_indices The vector of variable indices to convert
     * @return std::vector<uint32_t> A vector of real variable indices
     */
    std::vector<uint32_t> to_real(bb::UltraCircuitBuilder& ultra_circuit_constructor,
                                  std::vector<uint32_t>& variable_indices)
    {
        std::vector<uint32_t> real_variable_indices;
        real_variable_indices.reserve(variable_indices.size());
        for (auto& variable_index : variable_indices) {
            real_variable_indices.push_back(to_real(ultra_circuit_constructor, variable_index));
        }
        return real_variable_indices;
    };

    uint32_t to_real(bb::UltraCircuitBuilder& ultra_circuit_constructor, const uint32_t& variable_index)
    {
        return ultra_circuit_constructor.real_variable_index[variable_index];
    };
    size_t find_block_index(bb::UltraCircuitBuilder& ultra_builder, const UltraBlock& block);
    void process_gate_variables(bb::UltraCircuitBuilder& ultra_circuit_constructor,
                                std::vector<uint32_t>& gate_variables,
                                size_t gate_index,
                                size_t blk_idx);
    std::unordered_map<uint32_t, size_t> get_variables_gate_counts() { return this->variables_gate_counts; };

    std::vector<std::vector<uint32_t>> get_arithmetic_gate_connected_component(
        bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index, size_t block_idx, UltraBlock& blk);
    std::vector<uint32_t> get_elliptic_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                size_t index,
                                                                size_t block_idx,
                                                                UltraBlock& blk);
    std::vector<uint32_t> get_plookup_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                               size_t index,
                                                               size_t block_idx,
                                                               UltraBlock& blk);
    std::vector<uint32_t> get_sort_constraint_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                  size_t index,
                                                                  size_t block_idx,
                                                                  UltraBlock& blk);
    std::vector<uint32_t> get_poseido2s_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                 size_t index,
                                                                 size_t block_idx,
                                                                 UltraBlock& blk);
    std::vector<uint32_t> get_auxiliary_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                 size_t index,
                                                                 size_t block_idx,
                                                                 UltraBlock& blk);
    std::vector<uint32_t> get_rom_table_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                            const bb::UltraCircuitBuilder::RomTranscript& rom_array);
    std::vector<uint32_t> get_ram_table_connected_component(bb::UltraCircuitBuilder& ultra_builder,
                                                            const bb::UltraCircuitBuilder::RamTranscript& ram_array);

    void add_new_edge(const uint32_t& first_variable_index, const uint32_t& second_variable_index);
    std::vector<uint32_t> get_variable_adjacency_list(const uint32_t& variable_index)
    {
        return variable_adjacency_lists[variable_index];
    };

    void depth_first_search(const uint32_t& variable_index,
                            std::unordered_set<uint32_t>& is_used,
                            std::vector<uint32_t>& connected_component);
    std::vector<std::vector<uint32_t>> find_connected_components();

    std::vector<uint32_t> find_variables_with_degree_one();
    std::unordered_set<uint32_t> get_variables_in_one_gate();

    bool find_arithmetic_gate_for_variable(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                           const uint32_t& variable_idx);
    bool find_elliptic_gate_for_variable(bb::UltraCircuitBuilder& ultra_circuit_builder, const uint32_t& variable_idx);
    bool find_lookup_gate_for_variable(bb::UltraCircuitBuilder& ultra_circuit_builder, const uint32_t& variable_idx);

    size_t get_distance_between_variables(const uint32_t& first_variable_index, const uint32_t& second_variable_index);
    bool check_vertex_in_connected_component(const std::vector<uint32_t>& connected_component,
                                             const uint32_t& var_index);

    void connect_all_variables_in_vector(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                         const std::vector<uint32_t>& variables_vector);
    bool check_is_not_constant_variable(bb::UltraCircuitBuilder& ultra_circuit_builder, const uint32_t& variable_index);

    std::pair<std::vector<uint32_t>, size_t> get_connected_component_with_index(
        const std::vector<std::vector<uint32_t>>& connected_components, size_t index);

    std::unordered_set<uint32_t> get_variables_in_one_gate_without_range_constraints(
        bb::UltraCircuitBuilder& ultra_circuit_builder);

    size_t process_current_decompose_chain(bb::UltraCircuitBuilder& ultra_circuit_constructor,
                                           std::unordered_set<uint32_t>& variables_in_one_gate,
                                           size_t index);
    void process_current_plookup_gate(bb::UltraCircuitBuilder& ultra_circuit_builder, size_t gate_index);
    void remove_unnecessary_decompose_variables(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                std::unordered_set<uint32_t>& variables_in_on_gate,
                                                const std::unordered_set<uint32_t>& decompose_variables);
    void remove_unnecessary_plookup_variables(bb::UltraCircuitBuilder& ultra_circuit_builder);
    void remove_unnecessary_range_constrains_variables(bb::UltraCircuitBuilder& ultra_builder);
    std::unordered_set<uint32_t> show_variables_in_one_gate(bb::UltraCircuitBuilder& ultra_circuit_builder);

    void remove_unnecessary_aes_plookup_variables(std::unordered_set<uint32_t>& variables_in_one_gate,
                                                  bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                  bb::plookup::BasicTableId& table_id,
                                                  size_t gate_index);
    void remove_unnecessary_sha256_plookup_variables(std::unordered_set<uint32_t>& variables_in_one_gate,
                                                     bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                     bb::plookup::BasicTableId& table_id,
                                                     size_t gate_index);
    void remove_record_witness_variables(bb::UltraCircuitBuilder& ultra_builder);

    void print_graph();
    void print_connected_components();
    void print_variables_gate_counts();
    void print_variables_edge_counts();
    void print_variable_in_one_gate(bb::UltraCircuitBuilder& ultra_builder, const uint32_t real_idx);
    ~Graph_() = default;

  private:
    std::unordered_map<uint32_t, std::vector<uint32_t>>
        variable_adjacency_lists; // we use this data structure to contain information about variables and their
                                  // connections between each other
    std::unordered_map<uint32_t, size_t>
        variables_gate_counts; // we use this data structure to count, how many gates use every variable
    std::unordered_map<uint32_t, size_t>
        variables_degree; // we use this data structure to count, how many every variable have edges
    std::unordered_map<KeyPair, std::vector<size_t>, KeyHasher, KeyEquals>
        variable_gates; // we use this data structure to store gates and TraceBlocks for every variables, where static
                        // analyzer found them in the circuit.
    std::unordered_set<uint32_t> variables_in_one_gate;
    std::unordered_set<uint32_t> fixed_variables;
};

using Graph = Graph_<bb::fr>;

} // namespace cdg
