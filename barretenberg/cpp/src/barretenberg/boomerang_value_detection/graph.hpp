#pragma once
#include "barretenberg/stdlib_circuit_builders/standard_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <list>
#include <set>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

/*
 * this class describes arithmetic circuit as an undirected graph, where vertices are variables from circuit.
 * edges describe connections between variables through gates. We want to find variables that weren't properly
 * constrainted/some connections were missed using additional metrics, like in how much gate variable was and number of
 * connected components in the graph. if variable was in one connected component, it means that this variable wasn't
 * constrained properly. if number of connected components > 1, it means that there were missed some connections between
 * variables.
 */
template <typename FF> class Graph_ {
  public:
    Graph_() = default;
    Graph_(const Graph_& other) = delete;
    Graph_(Graph_&& other) = delete;
    Graph_& operator=(const Graph_& other) = delete;
    Graph_&& operator=(Graph_&& other) = delete;
    Graph_(const bb::StandardCircuitBuilder_<FF>& circuit_constructor);
    Graph_(bb::UltraCircuitBuilder& ultra_circuit_constructor);

    uint32_t to_real(bb::UltraCircuitBuilder& ultra_circuit_constructor, const uint32_t& variable_index)
    {
        return ultra_circuit_constructor.real_variable_index[variable_index];
    };
    void process_gate_variables(bb::UltraCircuitBuilder& ultra_circuit_constructor,
                                std::vector<uint32_t>& gate_variables);

    std::unordered_map<uint32_t, size_t> get_variables_gate_counts() { return this->variables_gate_counts; };

    std::vector<uint32_t> get_arithmetic_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                  size_t index);
    std::vector<uint32_t> get_elliptic_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                size_t index);
    std::vector<uint32_t> get_plookup_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                               size_t index);
    std::vector<uint32_t> get_sort_constraint_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                  size_t index);
    std::vector<uint32_t> get_poseido2s_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                 size_t index,
                                                                 bool is_internal_block = true);
    std::vector<uint32_t> get_auxiliary_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                 size_t index);
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
                                         const std::vector<uint32_t>& variables_vector,
                                         bool is_sorted_variables);
    bool check_is_not_constant_variable(bb::UltraCircuitBuilder& ultra_circuit_builder, const uint32_t& variable_index);

    std::pair<std::vector<uint32_t>, size_t> get_connected_component_with_index(
        const std::vector<std::vector<uint32_t>>& connected_components, size_t index);

    std::unordered_set<uint32_t> get_variables_in_one_gate_without_range_constraints(
        bb::UltraCircuitBuilder& ultra_circuit_builder);

    size_t process_current_decompose_chain(bb::UltraCircuitBuilder& ultra_circuit_constructor,
                                           std::unordered_set<uint32_t>& variables_in_one_gate,
                                           size_t index);
    void process_current_plookup_gate(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                      std::unordered_set<uint32_t>& variables_in_one_gate,
                                      size_t gate_index);
    void remove_unnecessary_decompose_variables(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                std::unordered_set<uint32_t>& variables_in_on_gate,
                                                const std::unordered_set<uint32_t>& decompose_variables);
    void remove_unnecessary_plookup_variables(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                              std::unordered_set<uint32_t>& variables_in_on_gate);
    std::unordered_set<uint32_t> show_variables_in_one_gate(bb::UltraCircuitBuilder& ultra_circuit_builder);

    void remove_unnecessary_aes_plookup_variables(std::unordered_set<uint32_t>& variables_in_one_gate,
                                                  bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                  bb::plookup::BasicTableId& table_id,
                                                  size_t gate_index);
    void remove_unnecessary_sha256_plookup_variables(std::unordered_set<uint32_t>& variables_in_one_gate,
                                                     bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                     bb::plookup::BasicTableId& table_id,
                                                     size_t gate_index);

    void print_graph();
    void print_connected_components();
    void print_variables_gate_counts();
    void print_variables_edge_counts();
    void print_variables_in_one_gate();
    ~Graph_() = default;

  private:
    std::unordered_map<uint32_t, std::vector<uint32_t>>
        variable_adjacency_lists; // we use this data structure to contain information about variables and their
                                  // connections between each other
    std::unordered_map<uint32_t, size_t>
        variables_gate_counts; // we use this data structure to count, how many gates use every variable
    std::unordered_map<uint32_t, size_t>
        variables_degree; // we use this data structure to count, how many every variable have edges
    std::unordered_map<uint32_t, std::vector<size_t>> variables_gates;
    std::unordered_set<uint32_t> variables_in_one_gate;
};

using Graph = Graph_<bb::fr>;