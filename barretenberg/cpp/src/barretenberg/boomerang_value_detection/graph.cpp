#include "graph.hpp"
#include <algorithm>
#include <stack>

template <typename FF> Graph_<FF>::Graph_(const bb::StandardCircuitBuilder_<FF>& circuit_constructor)
{
    this->variable_adjacency_lists = std::vector<std::set<uint32_t>>(circuit_constructor.real_variable_index.size());
    this->variables_gate_counts = std::unordered_map<uint32_t, size_t>(circuit_constructor.real_variable_index.size());
    const auto& block = circuit_constructor.blocks.arithmetic;
    auto zero_idx = circuit_constructor.zero_idx;
    std::map<FF, uint32_t> constant_variable_indices = circuit_constructor.constant_variable_indices;
    for (auto key : circuit_constructor.real_variable_index) {
        variables_gate_counts[key] = 0;
    }
    for (size_t i = 0; i < circuit_constructor.num_gates; i++) {
        uint32_t left_idx = block.w_l()[i];
        uint32_t right_idx = block.w_r()[i];
        uint32_t out_idx = block.w_o()[i];

        FF q_m = block.q_m()[i];
        FF q_1 = block.q_1()[i];
        FF q_2 = block.q_2()[i];
        FF q_3 = block.q_3()[i];
        std::set<uint32_t> unique_gate_variables;
        if ((q_m != FF::zero() || q_1 != FF::zero() || q_2 != FF::zero()) &&
            q_3 != FF::zero()) // this is not constant gate. we don't need constant variables
        {
            if (q_m != 0) {
                unique_gate_variables.insert(left_idx);
                unique_gate_variables.insert(right_idx);
            }
            if (q_1 != 0) {
                unique_gate_variables.insert(left_idx);
            }
            if (q_2 != 0) {
                unique_gate_variables.insert(right_idx);
            }
            if (q_3 != 0) {
                unique_gate_variables.insert(out_idx);
            }
        }
        for (const auto& elem : unique_gate_variables) {
            variables_gate_counts[elem] += 1;
        }
        std::vector<uint32_t> gate_variables(unique_gate_variables.begin(), unique_gate_variables.end());
        connect_all_variables_in_vector(gate_variables, zero_idx, constant_variable_indices, false);
    }
}

template <typename FF> Graph_<FF>::Graph_(bb::UltraCircuitBuilder& ultra_circuit_constructor)
{
    this->variables_gate_counts =
        std::unordered_map<uint32_t, size_t>(ultra_circuit_constructor.real_variable_index.size());
    this->variable_adjacency_lists =
        std::vector<std::set<uint32_t>>(ultra_circuit_constructor.real_variable_index.size());
    for (const auto& variables_index : ultra_circuit_constructor.real_variable_index) {
        variables_gate_counts[variables_index] = 0;
    }
    std::map<FF, uint32_t> constant_variable_indices = ultra_circuit_constructor.constant_variable_indices;
    uint32_t zero_idx = ultra_circuit_constructor.zero_idx;
    auto& arithmetic_block = ultra_circuit_constructor.blocks.arithmetic;
    auto arithmetic_gate_numbers = arithmetic_block.size();
    bool arithmetic_gate_exists = arithmetic_gate_numbers > 0;
    if (arithmetic_gate_exists) {
        for (size_t i = 0; i < arithmetic_gate_numbers; i++) {
            if (arithmetic_block.q_arith()[i] != 0) {
                uint32_t left_idx = arithmetic_block.w_l()[i];
                uint32_t right_idx = arithmetic_block.w_r()[i];
                uint32_t out_idx = arithmetic_block.w_o()[i];
                uint32_t fourth_idx = arithmetic_block.w_4()[i];
                FF q_m = arithmetic_block.q_m()[i];
                FF q_1 = arithmetic_block.q_1()[i];
                FF q_2 = arithmetic_block.q_2()[i];
                FF q_3 = arithmetic_block.q_3()[i];
                FF q_c = arithmetic_block.q_c()[i];
                FF q_4 = arithmetic_block.q_4()[i];
                std::set<uint32_t> unique_gate_variables;
                if (q_m == 0 && q_1 == 1 && q_2 == 0 && q_3 == 0 && q_c != 0 && q_4 == 0) {
                    info("This is the gate for fixing witness. We can ignore it");
                } else {
                    if (q_m != 0) {
                        unique_gate_variables.insert(left_idx);
                        unique_gate_variables.insert(right_idx);
                    }
                    if (q_1 != 0) {
                        unique_gate_variables.insert(left_idx);
                    }
                    if (q_2 != 0) {
                        unique_gate_variables.insert(right_idx);
                    }
                    if (q_3 != 0) {
                        unique_gate_variables.insert(out_idx);
                    }
                    if (q_4 != 0) {
                        unique_gate_variables.insert(fourth_idx);
                    }
                    for (const auto& elem : unique_gate_variables) {
                        variables_gate_counts[elem] += 1;
                    }
                }
                std::vector<uint32_t> gate_variables(unique_gate_variables.begin(), unique_gate_variables.end());
                connect_all_variables_in_vector(gate_variables, zero_idx, constant_variable_indices, false);
            } else {
                // this is the dummy gate for arithmetic gate. From ultra_circuit_builder.cpp I know that it was
                // created for sort_constraint with wires(variable_indx, zero_idx, zero_idx, zero_idx),
                // so it's need to update number_gate_counts for variable w_l()[i]
                variables_gate_counts[arithmetic_block.w_l()[i]] += 1;
            }
        }
    }
    auto& elliptic_block = ultra_circuit_constructor.blocks.elliptic;
    auto elliptic_gate_numbers = elliptic_block.size();
    bool elliptic_gates_exist = elliptic_gate_numbers > 0;
    if (elliptic_gates_exist) {
        for (size_t i = 0; i < elliptic_gate_numbers; i++) {
            std::vector wire_variables = {
                elliptic_block.w_l()[i], elliptic_block.w_r()[i], elliptic_block.w_o()[i], elliptic_block.w_4()[i]
            };
            for (const auto& elem : wire_variables) {
                if (elem != zero_idx) {
                    variables_gate_counts[elem] += 1;
                }
            }
        }
        for (size_t i = 1; i < elliptic_gate_numbers; i++) {
            if (elliptic_block.q_elliptic()[i - 1] == 1) {
                // the previous gate was connected with our current gate, cause it has the value "q_elliptic = 0"
                std::vector<uint32_t> coordinates = { elliptic_block.w_l()[i],     elliptic_block.w_r()[i],
                                                      elliptic_block.w_o()[i],     elliptic_block.w_4()[i],
                                                      elliptic_block.w_r()[i - 1], elliptic_block.w_o()[i - 1] };

                connect_all_variables_in_vector(coordinates, zero_idx, constant_variable_indices, false);
            }
            // if this condition is not approved, then then the previous was dummy gate, and it wasn't connected with
            // out current gate,
            // so we have to skip this gate and go to the next gate, cause it can extract variables from the current
            // gate
        }
    }
    auto& range_block = ultra_circuit_constructor.blocks.delta_range;
    auto range_gates = range_block.size();
    bool range_gates_exists = range_gates > 0;
    if (range_gates_exists) {
        // just go through gates and collect all variables, while we don't meet dummy gate
        std::vector<uint32_t> sorted_variables;
        for (size_t i = 0; i < range_gates; i++) {
            if (range_block.q_delta_range()[i] == 1) {
                uint32_t left_idx = range_block.w_l()[i];
                uint32_t right_idx = range_block.w_r()[i];
                uint32_t out_idx = range_block.w_o()[i];
                uint32_t fourth_idx = range_block.w_4()[i];
                sorted_variables.emplace_back(left_idx);
                sorted_variables.emplace_back(right_idx);
                sorted_variables.emplace_back(out_idx);
                sorted_variables.emplace_back(fourth_idx);
            } else {
                // we go to the dummy gate, there's a shift of the variable from the previous gate and
                // we have to update variable_gate_counts on 2 for this variable
                // after processing the dummy gate we have to clean sorted_variables_vector
                auto sorted_variables_size = sorted_variables.size();
                for (size_t i = 0; i < sorted_variables_size; i++) {
                    if (sorted_variables[i] != zero_idx) {
                        if (i == sorted_variables_size - 1) {
                            variables_gate_counts[sorted_variables[i]] += 2;
                        } else {
                            variables_gate_counts[sorted_variables[i]] += 1;
                        }
                    }
                }
                connect_all_variables_in_vector(sorted_variables, zero_idx, constant_variable_indices, true);
                sorted_variables.clear();
            }
        }
    }

    auto& lookup_block = ultra_circuit_constructor.blocks.lookup;
    auto lookup_gates = lookup_block.size();
    bool lookup_gates_exists = lookup_gates > 0;
    if (lookup_gates_exists) {
        std::vector<uint32_t> left_indexes;
        std::vector<uint32_t> right_indexes;
        std::vector<uint32_t> out_indexes;
        for (size_t i = 0; i < lookup_gates; i++) {
            if (lookup_block.q_lookup_type()[i] == FF(1)) {
                uint32_t left_idx = lookup_block.w_l()[i];
                uint32_t right_idx = lookup_block.w_r()[i];
                uint32_t out_idx = lookup_block.w_o()[i];
                left_indexes.emplace_back(left_idx);
                right_indexes.emplace_back(right_idx);
                out_indexes.emplace_back(out_idx);
                std::vector<uint32_t> current_gate_variables = { left_idx, right_idx, out_idx };
                for (const auto& variable : current_gate_variables) {
                    variables_gate_counts[variable] += 1;
                }
                connect_all_variables_in_vector(current_gate_variables, zero_idx, constant_variable_indices, false);
                auto q_2 = lookup_block.q_2()[i];
                auto q_m = lookup_block.q_m()[i];
                auto q_c = lookup_block.q_c()[i];
                if (q_2 == 0 && q_m == 0 && q_c == 0) {
                    // this is the last gate in the in this blocks of lookup, so we can connect variables from
                    //  left_indexes vectors, right_indexes vector, out_indexes vector
                    connect_all_variables_in_vector(left_indexes, zero_idx, constant_variable_indices, false);
                    connect_all_variables_in_vector(right_indexes, zero_idx, constant_variable_indices, false);
                    connect_all_variables_in_vector(out_indexes, zero_idx, constant_variable_indices, false);
                    // now we can erase all these vector to begin with new lookup accumulators
                    left_indexes.clear();
                    right_indexes.clear();
                    out_indexes.clear();
                }
            }
        }
    }
}

template <typename FF>
bool Graph_<FF>::check_is_not_constant_variable(const uint32_t& variable_index,
                                                const std::map<FF, uint32_t>& constant_variable_indices)
{
    // this method checks that variable is not constant, so it's not in constant_variable_indices from ultra circuit
    // builder
    bool is_not_constant = true;
    for (const auto& pair : constant_variable_indices) {
        if (pair.second == variable_index) {
            is_not_constant = false;
            break;
        }
    }
    return is_not_constant;
}

template <typename FF>
void Graph_<FF>::connect_all_variables_in_vector(const std::vector<uint32_t>& variables_vector,
                                                 const uint32_t& zero_idx,
                                                 const std::map<FF, uint32_t>& constant_variable_indices,
                                                 bool is_sorted_variables)
{
    // this method connects between each other variables that have different indexes, their indexes are not equal
    // zero_idx and they are not constant variables, so they are not in constant_variable_indices from ultra circuit
    // builder data structure
    if (!variables_vector.empty()) {
        if (is_sorted_variables) {
            for (size_t i = 0; i < variables_vector.size() - 1; i++) {
                if (variables_vector[i] != zero_idx && variables_vector[i + 1] != zero_idx &&
                    variables_vector[i] != variables_vector[i + 1]) {
                    {
                        bool first_variable_is_not_constant =
                            check_is_not_constant_variable(variables_vector[i], constant_variable_indices);
                        bool second_variable_is_not_constant =
                            check_is_not_constant_variable(variables_vector[i + 1], constant_variable_indices);
                        if (first_variable_is_not_constant && second_variable_is_not_constant) {
                            add_new_edge(variables_vector[i], variables_vector[i + 1]);
                        }
                    }
                }
            }
        } else {
            for (size_t i = 0; i < variables_vector.size() - 1; i++) {
                for (size_t j = 1; j < variables_vector.size(); j++) {
                    if (variables_vector[i] != zero_idx && variables_vector[j] != zero_idx &&
                        variables_vector[i] != variables_vector[j]) {
                        bool first_variable_is_not_constant =
                            check_is_not_constant_variable(variables_vector[i], constant_variable_indices);
                        bool second_variable_is_not_constant =
                            check_is_not_constant_variable(variables_vector[j], constant_variable_indices);
                        if (first_variable_is_not_constant && second_variable_is_not_constant) {
                            add_new_edge(variables_vector[i], variables_vector[j]);
                        }
                    }
                }
            }
        }
    }
}

template <typename FF>
void Graph_<FF>::add_new_edge(const uint32_t& first_variable_index, const uint32_t& second_variable_index)
{
    if (first_variable_index != second_variable_index) {
        this->variable_adjacency_lists[first_variable_index].insert(second_variable_index);
        this->variable_adjacency_lists[second_variable_index].insert(first_variable_index);
    }
}

// template <typename FF>
// void Graph_<FF>::update_edges_for_sorted_variables(const std::vector<uint32_t>& sorted_variables,
//                                                    const uint32_t& zero_idx)
//{
//     for (size_t i = 0; i < sorted_variables.size() - 1; i++) {
//         if (sorted_variables[i] != zero_idx && sorted_variables[i + 1] != zero_idx) {
//             add_new_edge(sorted_variables[i], sorted_variables[i + 1]);
//         }
//     }
//  }

template <typename FF> std::set<uint32_t> Graph_<FF>::get_variable_adjacency_list(const uint32_t& variable_index)
{
    if (variable_index >= (this->variable_adjacency_lists).size()) {
        throw std::out_of_range("Variable index out of bounds");
    }
    return variable_adjacency_lists[variable_index];
}

template <typename FF>
void Graph_<FF>::depth_first_search(const uint32_t& variable_index,
                                    std::vector<uint32_t>& is_used,
                                    std::set<uint32_t>& connected_component)
{
    // this method realizes algorith depth_first_search for undirected graph using the give variable
    std::stack<uint32_t> variable_stack;
    variable_stack.push(variable_index);
    while (!variable_stack.empty()) {
        uint32_t current_index = variable_stack.top();
        variable_stack.pop();
        if (std::find(is_used.begin(), is_used.end(), current_index) == is_used.end()) {
            is_used.emplace_back(current_index);
            connected_component.insert(current_index);
            for (const auto& it : variable_adjacency_lists[current_index]) {
                variable_stack.push(it);
            }
        }
    }
}

template <typename FF> std::vector<std::set<uint32_t>> Graph_<FF>::find_connected_components()
{
    // this methond finds connected components from the graph described by adjacency lists
    std::vector<uint32_t> is_used;
    std::vector<std::set<uint32_t>> connected_components;
    for (size_t i = 2; i < variable_adjacency_lists.size(); i++) {
        auto var_index = static_cast<uint32_t>(i);
        if (std::find(is_used.begin(), is_used.end(), var_index) == is_used.end()) {
            std::set<uint32_t> connected_component;
            depth_first_search(var_index, is_used, connected_component);
            connected_components.emplace_back(connected_component);
        }
    }
    return connected_components;
}

template <typename FF> std::vector<uint32_t> Graph_<FF>::find_dangerous_variables()
{
    std::vector<uint32_t> dangerous_variables;
    for (auto& it : variables_gate_counts) {
        if (it.first >= 2) {
            if (it.second == 1) {
                dangerous_variables.emplace_back(it.first);
            }
        }
    }
    return dangerous_variables;
}

template <typename FF> void Graph_<FF>::print_graph()
{
    for (size_t i = 2; i < this->variable_adjacency_lists.size(); i++) {
        info("variable with index ", i);
        if (this->variable_adjacency_lists[i].size() == 0) {
            info("is isolated");
        } else {
            for (auto it = this->variable_adjacency_lists[i].begin(); it != this->variable_adjacency_lists[i].end();
                 ++it) {
                info(*it, " ");
            }
        }
    }
}

template <typename FF> void Graph_<FF>::print_connected_components()
{
    auto connected_components = find_connected_components();
    for (size_t i = 0; i < connected_components.size(); i++) {
        info("printing the ", i, " connected component:");
        for (const auto& it : connected_components[i]) {
            info(it, " ");
        }
    }
}

template <typename FF>
void Graph_<FF>::print_dangerous_variables(const bb::StandardCircuitBuilder_<FF>& circuit_constructor)
{
    auto dangerous_variables = find_dangerous_variables();
    const auto& block = circuit_constructor.blocks.arithmetic;
    for (const auto& it : dangerous_variables) {
        info("index of the possible dangerous variable with index ", it);
        for (size_t i = 0; i < circuit_constructor.num_gates; i++) {
            uint32_t left_idx = block.w_l()[i];
            uint32_t right_idx = block.w_r()[i];
            uint32_t out_idx = block.w_o()[i];
            if (it == left_idx || it == right_idx || it == out_idx) {
                info("variable ", it, " in the gate with number ", i);
                //                 std::vector<FF> selectors = {
                //                     block.q_m()[i], block.q_1()[i], block.q_2()[i], block.q_3()[i],
                //                     block.q_c()[i]
                //                 };
                //                 info("selectors of this gate: ");
                //                 for (const auto& it : selectors) {
                //                     info(it);
                //                 }
                break;
            }
        }
    }
}

template <typename FF> void Graph_<FF>::print_variables_gate_counts()
{
    for (auto& it : variables_gate_counts) {
        info("number of gates with variables ", it.first);
        info(it.second);
    }
}

template class Graph_<bb::fr>;