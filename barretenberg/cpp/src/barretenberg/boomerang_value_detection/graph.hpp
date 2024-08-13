#pragma once
#include "barretenberg/stdlib_circuit_builders/standard_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <list>
#include <set>
#include <unordered_map>
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

    bool is_variable_exist(const uint32_t& variable_index);
    void add_new_edge(const uint32_t& first_variable_index, const uint32_t& second_variable_index);

    std::set<uint32_t> get_variable_adjacency_list(const uint32_t& variable_index);
    void depth_first_search(const uint32_t& variable_index,
                            std::vector<uint32_t>& is_used,
                            std::set<uint32_t>& connected_component);
    std::vector<std::set<uint32_t>> find_connected_components();
    std::vector<uint32_t> find_dangerous_variables();
    std::unordered_map<uint32_t, size_t> get_variables_gate_counts() { return this->variables_gate_counts; };
    size_t get_distance_between_variables(const uint32_t& first_variable_index, const uint32_t& second_variable_index);
    bool check_vertex_in_connected_component(const std::vector<uint32_t>& connected_component,
                                             const uint32_t& var_index);

    void update_edges_for_sorted_variables(const std::vector<uint32_t>& sorted_variables,
                                           const uint32_t& zero_idx,
                                           const std::map<FF, uint32_t>& constant_variable_indices);
    void connect_all_variables_in_vector(const std::vector<uint32_t>& variables_vector,
                                         const uint32_t& zero_idx,
                                         const std::map<FF, uint32_t>& constant_variable_indices,
                                         bool is_sorted_variables);
    bool check_is_not_constant_variable(const uint32_t& variable_index,
                                        const std::map<FF, uint32_t>& constant_variable_indices);

    void print_graph();
    void print_connected_components();
    void print_variables_gate_counts();
    void print_dangerous_variables(const bb::StandardCircuitBuilder_<FF>& circuit_constructor);
    ~Graph_() = default;

  private:
    std::vector<std::set<uint32_t>> variable_adjacency_lists;
    std::unordered_map<uint32_t, size_t> variables_gate_counts;
};

using Graph = Graph_<bb::fr>;