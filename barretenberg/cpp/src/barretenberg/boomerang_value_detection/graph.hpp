#pragma once
#include "barretenberg/stdlib_circuit_builders/standard_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <list>
#include <set>
#include <unordered_map>
#include <utility>
#include <vector>

template <typename FF> class Graph_ {
  public:
    Graph_() = default;
    Graph_(const Graph_& other) = delete;
    Graph_(Graph_&& other) = delete;
    Graph_& operator=(const Graph_& other) = delete;
    Graph_&& operator=(Graph_&& other) = delete;
    Graph_(const bb::StandardCircuitBuilder_<FF>& circuit_constructor);
    Graph_(bb::UltraCircuitBuilder& ultra_circuit_constructor);

    std::unordered_map<uint32_t, size_t> get_variables_gate_counts() { return this->variables_gate_counts; };

    std::vector<uint32_t> get_arithmetic_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                  size_t index);
    std::vector<uint32_t> get_elliptic_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                                size_t index);
    std::vector<uint32_t> get_plookup_gate_connected_component(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                               size_t index);
    std::pair<bool, std::vector<uint32_t>> get_sort_constraint_connected_component(
        bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index);

    void add_new_edge(const uint32_t& first_variable_index, const uint32_t& second_variable_index);
    std::vector<uint32_t> get_variable_adjacency_list(const uint32_t& variable_index);

    void depth_first_search(const uint32_t& variable_index,
                            std::unordered_set<uint32_t>& is_used,
                            std::vector<uint32_t>& connected_component);
    std::vector<std::vector<uint32_t>> find_connected_components();
    std::vector<uint32_t> find_dangerous_variables();

    size_t get_distance_between_variables(const uint32_t& first_variable_index, const uint32_t& second_variable_index);
    bool check_vertex_in_connected_component(const std::vector<uint32_t>& connected_component,
                                             const uint32_t& var_index);

    void connect_all_variables_in_vector(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                         const std::vector<uint32_t>& variables_vector,
                                         bool is_sorted_variables);
    bool check_is_not_constant_variable(bb::UltraCircuitBuilder& ultra_circuit_builder, const uint32_t& variable_index);

    void print_graph();
    void print_connected_components();
    void print_variables_gate_counts();
    void print_dangerous_variables(const bb::StandardCircuitBuilder_<FF>& circuit_constructor);
    void print_variables_edge_counts();
    ~Graph_() = default;

  private:
    std::unordered_map<uint32_t, std::vector<uint32_t>> variable_adjacency_lists;
    std::unordered_map<uint32_t, size_t> variables_gate_counts;
    std::unordered_map<uint32_t, size_t> variables_degree;
};

using Graph = Graph_<bb::fr>;