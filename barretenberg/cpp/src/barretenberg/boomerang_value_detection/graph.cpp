#include "graph.hpp"
#include <algorithm>
#include <stack>

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_arithmetic_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index)
{
    auto to_real = [&](uint32_t variable_index) { return ultra_circuit_builder.real_variable_index[variable_index]; };
    auto& arithmetic_block = ultra_circuit_builder.blocks.arithmetic;
    uint32_t left_idx = arithmetic_block.w_l()[index];
    uint32_t right_idx = arithmetic_block.w_r()[index];
    uint32_t out_idx = arithmetic_block.w_o()[index];
    uint32_t fourth_idx = arithmetic_block.w_4()[index];
    auto q_m = arithmetic_block.q_m()[index];
    auto q_1 = arithmetic_block.q_1()[index];
    auto q_2 = arithmetic_block.q_2()[index];
    auto q_3 = arithmetic_block.q_3()[index];
    auto q_4 = arithmetic_block.q_4()[index];
    std::vector<uint32_t> gate_variables = {};
    if (q_m != 0 || q_1 != 1 || q_2 != 0 || q_3 != 0 || q_4 != 0) {
        // this is not the gate for fix_witness, so we have to process this gate
        if (arithmetic_block.q_arith()[index] > 0) {
            if (q_m != 0) {
                gate_variables.emplace_back(left_idx);
                gate_variables.emplace_back(right_idx);
            }
            if (q_1 != 0) {
                gate_variables.emplace_back(left_idx);
            }
            if (q_2 != 0) {
                gate_variables.emplace_back(right_idx);
            }
            if (q_3 != 0) {
                gate_variables.emplace_back(out_idx);
            }
            if (q_4 != 0) {
                gate_variables.emplace_back(fourth_idx);
            }
            if (arithmetic_block.q_arith()[index] == 1 && q_m == 0) {
            }
            if (arithmetic_block.q_arith()[index] == 2) {
                // We have to use w_4_shift from the next gate
                // if and only if the current gate isn't last, cause we can't
                // look into the next gate
                if (index != arithmetic_block.size() - 1) {
                    uint32_t fourth_shift_idx = arithmetic_block.w_4()[index + 1];
                    gate_variables.emplace_back(fourth_shift_idx);
                }
            }
            if (arithmetic_block.q_arith()[index] == 3) {
                info("q_arith == 3 isn't implemented yet");
            }
        }
    }
    auto unique_variables = std::unique(gate_variables.begin(), gate_variables.end());
    gate_variables.erase(unique_variables, gate_variables.end());
    std::transform(gate_variables.cbegin(), gate_variables.cend(), gate_variables.begin(), to_real);
    if (!gate_variables.empty()) {
        for (const auto& real_variable_index : gate_variables) {
            variables_gate_counts[real_variable_index] += 1;
        }
    }
    return gate_variables;
}

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_elliptic_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index)
{
    auto to_real = [&](uint32_t variable_index) { return ultra_circuit_builder.real_variable_index[variable_index]; };
    auto& elliptic_block = ultra_circuit_builder.blocks.elliptic;
    std::vector<uint32_t> gate_variables = {};
    bool is_elliptic_gate = elliptic_block.q_elliptic()[index] == 1;
    bool is_elliptic_add_gate = elliptic_block.q_1()[index] != 0 && elliptic_block.q_m()[index] == 0;
    bool is_elliptic_dbl_gate = elliptic_block.q_1()[index] == 0 && elliptic_block.q_m()[index] == 1;
    if (is_elliptic_gate) {
        auto right_idx = elliptic_block.w_r()[index];
        auto out_idx = elliptic_block.w_o()[index];
        gate_variables.emplace_back(right_idx);
        gate_variables.emplace_back(out_idx);
        if (index != elliptic_block.size() - 1) {
            if (is_elliptic_add_gate) {
                // if this gate is ecc_add_gate, we have to get indices x2, x3, y3, y2 from the next gate
                gate_variables.emplace_back(elliptic_block.w_l()[index + 1]);
                gate_variables.emplace_back(elliptic_block.w_r()[index + 1]);
                gate_variables.emplace_back(elliptic_block.w_o()[index + 1]);
                gate_variables.emplace_back(elliptic_block.w_4()[index + 1]);
            }
            if (is_elliptic_dbl_gate) {
                // if this gate is ecc_dbl_gate, we have to indices x3, y3 from right and output wires
                gate_variables.emplace_back(elliptic_block.w_r()[index + 1]);
                gate_variables.emplace_back(elliptic_block.w_o()[index + 1]);
            }
        }
    }
    auto unique_variables = std::unique(gate_variables.begin(), gate_variables.end());
    gate_variables.erase(unique_variables, gate_variables.end());
    std::transform(gate_variables.cbegin(), gate_variables.cend(), gate_variables.begin(), to_real);
    if (!gate_variables.empty()) {
        for (const auto& real_variable_index : gate_variables) {
            variables_gate_counts[real_variable_index] += 1;
        }
    }
    return gate_variables;
}

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_sort_constraint_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index)
{
    auto to_real = [&](uint32_t variable_index) { return ultra_circuit_builder.real_variable_index[variable_index]; };
    auto& delta_range_block = ultra_circuit_builder.blocks.delta_range;
    std::vector<uint32_t> gate_variables = {};
    if (delta_range_block.q_delta_range()[index] == 1) {
        auto left_idx = delta_range_block.w_l()[index];
        auto right_idx = delta_range_block.w_r()[index];
        auto out_idx = delta_range_block.w_o()[index];
        auto fourth_idx = delta_range_block.w_4()[index];
        gate_variables.insert(gate_variables.end(), { left_idx, right_idx, out_idx, fourth_idx });
    }
    auto unique_variables = std::unique(gate_variables.begin(), gate_variables.end());
    gate_variables.erase(unique_variables, gate_variables.end());
    std::transform(gate_variables.cbegin(), gate_variables.cend(), gate_variables.begin(), to_real);
    if (!gate_variables.empty()) {
        for (const auto& real_variable_index : gate_variables) {
            variables_gate_counts[real_variable_index] += 1;
        }
    }
    return gate_variables;
}

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_plookup_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index)
{
    auto to_real = [&](uint32_t variable_index) { return ultra_circuit_builder.real_variable_index[variable_index]; };
    std::vector<uint32_t> variable_indices = {};
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    auto q_2 = lookup_block.q_2()[index];
    auto q_m = lookup_block.q_m()[index];
    auto q_c = lookup_block.q_c()[index];
    auto left_idx = lookup_block.w_l()[index];
    auto right_idx = lookup_block.w_r()[index];
    auto out_idx = lookup_block.w_o()[index];
    variable_indices.emplace_back(left_idx);
    variable_indices.emplace_back(right_idx);
    variable_indices.emplace_back(out_idx);
    if (index < lookup_block.size() - 1) {
        if (q_2 != 0 || q_m != 0 || q_c != 0) {
            if (q_2 != 0) {
                variable_indices.emplace_back(lookup_block.w_l()[index + 1]);
            }
            if (q_m != 0) {
                variable_indices.emplace_back(lookup_block.w_r()[index + 1]);
            }
            if (q_c != 0) {
                variable_indices.emplace_back(lookup_block.w_o()[index + 1]);
            }
        }
    }
    auto unique_variables = std::unique(variable_indices.begin(), variable_indices.end());
    variable_indices.erase(unique_variables, variable_indices.end());
    std::transform(variable_indices.cbegin(), variable_indices.cend(), variable_indices.begin(), to_real);
    if (!variable_indices.empty()) {
        for (const auto& real_variable_index : variable_indices) {
            variables_gate_counts[real_variable_index] += 1;
        }
    }
    return variable_indices;
}

template <typename FF> Graph_<FF>::Graph_(bb::UltraCircuitBuilder& ultra_circuit_constructor)
{
    this->variables_gate_counts =
        std::unordered_map<uint32_t, size_t>(ultra_circuit_constructor.real_variable_index.size());
    this->variable_adjacency_lists =
        std::unordered_map<uint32_t, std::vector<uint32_t>>(ultra_circuit_constructor.real_variable_index.size());
    this->variables_degree = std::unordered_map<uint32_t, size_t>(ultra_circuit_constructor.real_variable_index.size());
    for (const auto& variable_index : ultra_circuit_constructor.real_variable_index) {
        variables_gate_counts[variable_index] = 0;
        variables_degree[variable_index] = 0;
        variable_adjacency_lists[variable_index] = {};
    }

    std::map<FF, uint32_t> constant_variable_indices = ultra_circuit_constructor.constant_variable_indices;
    const auto& arithmetic_block = ultra_circuit_constructor.blocks.arithmetic;
    auto arithmetic_gate_numbers = arithmetic_block.size();
    bool arithmetic_gate_exists = arithmetic_gate_numbers > 0;
    if (arithmetic_gate_exists) {
        for (size_t i = 0; i < arithmetic_gate_numbers; i++) {
            auto gate_variables = get_arithmetic_gate_connected_component(ultra_circuit_constructor, i);
            connect_all_variables_in_vector(ultra_circuit_constructor, gate_variables, false);
        }
    }
    const auto& elliptic_block = ultra_circuit_constructor.blocks.elliptic;
    auto elliptic_gate_numbers = elliptic_block.size();
    bool elliptic_gates_exist = elliptic_gate_numbers > 0;
    if (elliptic_gates_exist) {
        for (size_t i = 0; i < elliptic_gate_numbers; i++) {
            std::vector<uint32_t> gate_variables = get_elliptic_gate_connected_component(ultra_circuit_constructor, i);
            connect_all_variables_in_vector(ultra_circuit_constructor, gate_variables, false);
        }
    }
    const auto& range_block = ultra_circuit_constructor.blocks.delta_range;
    auto range_gates = range_block.size();
    bool range_gates_exists = range_gates > 0;
    if (range_gates_exists) {
        std::vector<uint32_t> sorted_variables;
        for (size_t i = 0; i < range_gates; i++) {
            auto current_gate = get_sort_constraint_connected_component(ultra_circuit_constructor, i);
            if (!current_gate.empty()) {
                sorted_variables.insert(sorted_variables.end(), current_gate.begin(), current_gate.end());
            } else {
                connect_all_variables_in_vector(ultra_circuit_constructor, sorted_variables, true);
                sorted_variables.clear();
            }
        }
    }

    const auto& lookup_block = ultra_circuit_constructor.blocks.lookup;
    auto lookup_gates = lookup_block.size();
    bool lookup_gates_exists = lookup_gates > 0;
    if (lookup_gates_exists) {
        for (size_t i = 0; i < lookup_gates; i++) {
            std::vector<uint32_t> variable_indices = get_plookup_gate_connected_component(ultra_circuit_constructor, i);
            connect_all_variables_in_vector(ultra_circuit_constructor, variable_indices, false);
        }
    }
}

template <typename FF>
bool Graph_<FF>::check_is_not_constant_variable(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                const uint32_t& variable_index)
{
    // this method checks that variable is not constant, so it's not in constant_variable_indices from ultra circuit
    // builder
    bool is_not_constant = true;
    auto constant_variable_indices = ultra_circuit_builder.constant_variable_indices;
    for (const auto& pair : constant_variable_indices) {
        if (pair.second == ultra_circuit_builder.real_variable_index[variable_index]) {
            is_not_constant = false;
            break;
        }
    }
    return is_not_constant;
}

template <typename FF>
void Graph_<FF>::connect_all_variables_in_vector(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                 const std::vector<uint32_t>& variables_vector,
                                                 bool is_sorted_variables)
{
    // this method connects between each other variables that have different indexes, their indexes are not equal
    // zero_idx and they are not constant variables, so they are not in constant_variable_indices from ultra circuit
    // builder data structure
    if (!variables_vector.empty()) {
        if (is_sorted_variables) {
            for (size_t i = 0; i < variables_vector.size() - 1; i++) {
                if (variables_vector[i] != ultra_circuit_builder.zero_idx &&
                    variables_vector[i + 1] != ultra_circuit_builder.zero_idx &&
                    variables_vector[i] != variables_vector[i + 1]) {
                    {
                        bool first_variable_is_not_constant =
                            check_is_not_constant_variable(ultra_circuit_builder, variables_vector[i]);
                        bool second_variable_is_not_constant =
                            check_is_not_constant_variable(ultra_circuit_builder, variables_vector[i + 1]);
                        if (first_variable_is_not_constant && second_variable_is_not_constant) {
                            add_new_edge(variables_vector[i], variables_vector[i + 1]);
                        }
                    }
                }
            }
        } else {
            for (size_t i = 0; i < variables_vector.size() - 1; i++) {
                for (size_t j = 1; j < variables_vector.size(); j++) {
                    if (variables_vector[i] != ultra_circuit_builder.zero_idx &&
                        variables_vector[j] != ultra_circuit_builder.zero_idx &&
                        variables_vector[i] != variables_vector[j]) {

                        bool first_variable_is_not_constant =
                            check_is_not_constant_variable(ultra_circuit_builder, variables_vector[i]);
                        bool second_variable_is_not_constant =
                            check_is_not_constant_variable(ultra_circuit_builder, variables_vector[j]);
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
    variable_adjacency_lists[first_variable_index].emplace_back(second_variable_index);
    variable_adjacency_lists[second_variable_index].emplace_back(first_variable_index);
    variables_degree[first_variable_index] += 1;
    variables_degree[second_variable_index] += 1;
}

template <typename FF> std::vector<uint32_t> Graph_<FF>::get_variable_adjacency_list(const uint32_t& variable_index)
{
    return variable_adjacency_lists[variable_index];
}

template <typename FF>
void Graph_<FF>::depth_first_search(const uint32_t& variable_index,
                                    std::unordered_set<uint32_t>& is_used,
                                    std::vector<uint32_t>& connected_component)
{
    // this method realizes algorithm depth_first_search for undirected graph using the give variable
    std::stack<uint32_t> variable_stack;
    variable_stack.push(variable_index);
    while (!variable_stack.empty()) {
        uint32_t current_index = variable_stack.top();
        variable_stack.pop();
        if (!is_used.contains(current_index)) {
            is_used.insert(current_index);
            connected_component.emplace_back(current_index);
            for (const auto& it : variable_adjacency_lists[current_index]) {
                variable_stack.push(it);
            }
        }
    }
}

template <typename FF> std::vector<std::vector<uint32_t>> Graph_<FF>::find_connected_components()
{
    // this methond finds connected components from the graph described by adjacency lists
    std::unordered_set<uint32_t> is_used;
    std::vector<std::vector<uint32_t>> connected_components;
    for (const auto& pair : variable_adjacency_lists) {
        if (pair.first != 0 && variables_degree[pair.first] > 0) {
            if (!is_used.contains(pair.first)) {
                std::vector<uint32_t> connected_component;
                depth_first_search(pair.first, is_used, connected_component);
                std::sort(connected_component.begin(), connected_component.end());
                connected_components.emplace_back(connected_component);
            }
        }
    }
    return connected_components;
}

template <typename FF>
inline size_t Graph_<FF>::process_current_decompose_chain(bb::UltraCircuitBuilder& ultra_circuit_constructor,
                                                          std::unordered_set<uint32_t>& variables_in_on_gate,
                                                          size_t index)
{
    auto to_real = [&](uint32_t variable_index) {
        return ultra_circuit_constructor.real_variable_index[variable_index];
    };
    auto& arithmetic_block = ultra_circuit_constructor.blocks.arithmetic;
    auto zero_idx = ultra_circuit_constructor.zero_idx;
    size_t current_index = index;
    std::vector<uint32_t> accumulators_indices;
    while (true) {
        // we have to remove left, right and output wires of the current gate, cause they'are new_limbs, and they are
        // useless for the analyzer
        auto fourth_idx = arithmetic_block.w_4()[current_index];
        accumulators_indices.emplace_back(to_real(fourth_idx));
        auto left_idx = arithmetic_block.w_l()[current_index];
        if (left_idx != zero_idx) {
            variables_in_on_gate.erase(to_real(left_idx));
        }
        auto right_idx = arithmetic_block.w_r()[current_index];
        if (right_idx != zero_idx) {
            variables_in_on_gate.erase(to_real(right_idx));
        }
        auto out_idx = arithmetic_block.w_o()[current_index];
        if (out_idx != zero_idx) {
            variables_in_on_gate.erase(to_real(out_idx));
        }
        auto q_arith = arithmetic_block.q_arith()[current_index];
        if (q_arith == 1 || current_index == arithmetic_block.size() - 1) {
            // this is the last gate in this chain, or we can't go next, so we have to stop a loop
            break;
        }
        current_index++;
    }
    for (size_t i = 0; i < accumulators_indices.size(); i++) {
        if (i == 0) {
            // the first variable in accumulators is the variable which decompose was created. So, we have to decrement
            // variable_gate_counts for this variable
            variables_gate_counts[accumulators_indices[i]] -= 1;
        } else {
            // next accumulators are useless variables that are not interested for the analyzer. So, for these variables
            // we can nullify variables_gate_counts
            variables_gate_counts[accumulators_indices[i]] = 0;
        }
    }
    // we don't want to make variables_gate_counts for intermediate variables negative, so, can go to the next gates
    return current_index;
}

template <typename FF>
inline void Graph_<FF>::remove_unnecessary_decompose_variables(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                               std::unordered_set<uint32_t>& variables_in_one_gate,
                                                               const std::unordered_set<uint32_t>& decompose_variables)
{
    auto is_power_two = [&](const uint256_t& number) { return number > 0 && ((number & (number - 1)) == 0); };
    auto to_real = [&](uint32_t variable_index) { return ultra_circuit_builder.real_variable_index[variable_index]; };
    auto find_position = [&](uint32_t variable_index) { return decompose_variables.contains(to_real(variable_index)); };
    // the idea of this function to get the endpoints of the decompose chains. For that we have to clean variable_index
    // from unnecessary variables for example, left, right, output wires
    auto& arithmetic_block = ultra_circuit_builder.blocks.arithmetic;
    if (arithmetic_block.size() > 0) {
        for (size_t i = 0; i < arithmetic_block.size(); i++) {
            auto q_1 = arithmetic_block.q_1()[i];
            auto q_2 = arithmetic_block.q_2()[i];
            auto q_3 = arithmetic_block.q_3()[i];
            // big addition gate from decompose has selectors, which have the next property:
            // q_1 = (1) << shifts[0], target_range_bitnum * (3 * i),
            // q_2 = (1) << shifts[1], target_range_bitnum * (3 * i + 1),
            // q_3 = (1) << shifts[2], target_range_bitnum * (3 * i + 2)
            // so, they are power of two and satisfying the following equality: q_2 * q_2 = q_1 * q_3
            // this way we can differ them from other arithmetic gates
            bool q_1_is_power_two = is_power_two(q_1);
            bool q_2_is_power_two = is_power_two(q_2);
            bool q_3_is_power_two = is_power_two(q_3);
            if (q_2 * q_2 == q_1 * q_3 && q_1_is_power_two && q_2_is_power_two && q_3_is_power_two) {
                uint32_t left_idx = arithmetic_block.w_l()[i];
                uint32_t right_idx = arithmetic_block.w_r()[i];
                uint32_t out_idx = arithmetic_block.w_o()[i];
                uint32_t fourth_idx = arithmetic_block.w_4()[i];
                bool find_left = find_position(left_idx);
                bool find_right = find_position(right_idx);
                bool find_out = find_position(out_idx);
                bool find_fourth = find_position(fourth_idx);
                if (((find_left && find_right && find_out) || (find_left && find_right && !find_out) ||
                     (find_left && find_right && !find_out) || (find_left && !find_right && !find_out)) &&
                    !find_fourth) {
                    i = process_current_decompose_chain(ultra_circuit_builder, variables_in_one_gate, i);
                }
            }
        }
    }
}

template <typename FF>
void Graph_<FF>::remove_unnecessary_plookup_variables(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                      std::unordered_set<uint32_t>& variables_in_one_gate)
{
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    if (lookup_block.size() > 0) {
        for (size_t i = 0; i < lookup_block.size(); i++) {
            process_current_plookup_gate(ultra_circuit_builder, variables_in_one_gate, i);
        }
    }
}

template <typename FF>
inline void Graph_<FF>::process_current_plookup_gate(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                     std::unordered_set<uint32_t>& variables_in_one_gate,
                                                     size_t gate_index)
{
    auto to_real = [&](uint32_t variable_index) { return ultra_circuit_builder.real_variable_index[variable_index]; };
    auto find_position = [&](uint32_t variable_index) {
        return variables_in_one_gate.contains(to_real(variable_index));
    };
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    auto& lookup_tables = ultra_circuit_builder.lookup_tables;
    auto table_index = static_cast<size_t>(lookup_block.q_3()[gate_index]);
    for (const auto& table : lookup_tables) {
        if (table.table_index == table_index) {
            std::set<bb::fr> column_1(table.column_1.begin(), table.column_1.end());
            std::set<bb::fr> column_2(table.column_2.begin(), table.column_2.end());
            std::set<bb::fr> column_3(table.column_3.begin(), table.column_3.end());
            bb::plookup::BasicTableId id = table.id;
            if (id == bb::plookup::AES_SBOX_MAP || id == bb::plookup::AES_SPARSE_MAP) {
                uint32_t out_idx = lookup_block.w_o()[gate_index];
                uint32_t real_out_idx = to_real(out_idx);
                bool find_out = find_position(real_out_idx);
                auto q_c = lookup_block.q_c()[gate_index];
                if (q_c == 0) {
                    if (find_out) {
                        variables_in_one_gate.erase(real_out_idx);
                    }
                }
            }
            if (id == bb::plookup::SHA256_WITNESS_SLICE_3) {
                uint32_t real_right_idx = to_real(lookup_block.w_r()[gate_index]);
                uint32_t real_out_idx = to_real(lookup_block.w_o()[gate_index]);
                auto q_m = lookup_block.q_m()[gate_index];
                auto q_c = lookup_block.q_c()[gate_index];
                bool find_out = find_position(real_out_idx);
                bool find_right = find_position(real_right_idx);
                if (q_c == 0) {
                    if (find_out) {
                        variables_in_one_gate.erase(real_out_idx);
                    }
                }
                if (q_m == 0) {
                    if (find_right) {
                        variables_in_one_gate.erase(real_right_idx);
                    }
                }
            }
            if (column_1.size() == 1) {
                uint32_t left_idx = lookup_block.w_l()[gate_index];
                uint32_t real_left_idx = to_real(left_idx);
                bool find_left = find_position(real_left_idx);
                if (find_left) {
                    variables_in_one_gate.erase(real_left_idx);
                }
            }
            if (column_2.size() == 1) {
                uint32_t right_idx = lookup_block.w_r()[gate_index];
                uint32_t real_right_idx = to_real(right_idx);
                bool find_right = find_position(real_right_idx);
                if (find_right) {
                    variables_in_one_gate.erase(real_right_idx);
                }
            }
            if (column_3.size() == 1) {
                uint32_t out_idx = lookup_block.w_o()[gate_index];
                /* if (out_idx == 2506) {
                    info("break here");
                    info("out_idx == ", out_idx);
                } */
                uint32_t real_out_idx = to_real(out_idx);
                bool find_out = find_position(real_out_idx);
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
        }
    }
}

template <typename FF>
std::unordered_set<uint32_t> Graph_<FF>::show_variables_in_one_gate(bb::UltraCircuitBuilder& ultra_circuit_builder)
{
    std::unordered_set<uint32_t> variables_in_one_gate;
    for (const auto& pair : variables_gate_counts) {
        bool is_not_constant_variable = check_is_not_constant_variable(ultra_circuit_builder, pair.first);
        if (pair.second == 1 && pair.first != 0 && is_not_constant_variable) {
            variables_in_one_gate.insert(pair.first);
        }
    }
    auto range_lists = ultra_circuit_builder.range_lists;
    std::unordered_set<uint32_t> decompose_varialbes;
    for (auto& pair : range_lists) {
        for (auto& elem : pair.second.variable_indices) {
            bool is_not_constant_variable = check_is_not_constant_variable(ultra_circuit_builder, elem);
            if (variables_gate_counts[ultra_circuit_builder.real_variable_index[elem]] == 1 &&
                is_not_constant_variable) {
                decompose_varialbes.insert(ultra_circuit_builder.real_variable_index[elem]);
            }
        }
    }
    remove_unnecessary_decompose_variables(ultra_circuit_builder, variables_in_one_gate, decompose_varialbes);
    remove_unnecessary_plookup_variables(ultra_circuit_builder, variables_in_one_gate);
    return variables_in_one_gate;
}

std::pair<std::vector<uint32_t>, size_t> get_connected_component_with_index(
    const std::vector<std::vector<uint32_t>>& connected_components, size_t index)
{
    auto connected_component = connected_components[index];
    auto size = connected_component.size();
    return std::make_pair(connected_component, size);
}

template <typename FF> void Graph_<FF>::print_graph()
{
    for (const auto& elem : variable_adjacency_lists) {
        info("variable with index", elem.first);
        if (variable_adjacency_lists[elem.first].empty()) {
            info("is isolated");
        } else {
            for (const auto& it : elem.second) {
                info(it);
            }
        }
    }
}

template <typename FF> void Graph_<FF>::print_connected_components()
{
    auto connected_components = find_connected_components();
    for (size_t i = 0; i < connected_components.size(); i++) {
        info("printing the ", i + 1, " connected component:");
        for (const auto& it : connected_components[i]) {
            info(it, " ");
        }
    }
}

template <typename FF> void Graph_<FF>::print_variables_gate_counts()
{
    for (const auto& it : variables_gate_counts) {
        info("number of gates with variables ", it.first, " == ", it.second);
        info(it.second);
    }
}

template <typename FF> void Graph_<FF>::print_variables_edge_counts()
{
    for (const auto& it : variables_degree) {
        if (it.first != 0) {
            info("variable index = ", it.first);
            info("number of edges for this variables = ", it.second);
        }
    }
}

template class Graph_<bb::fr>;