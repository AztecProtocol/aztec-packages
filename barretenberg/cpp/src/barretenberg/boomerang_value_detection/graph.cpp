#include "./graph.hpp"
#include "./gate_patterns.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <algorithm>
#include <array>
#include <iomanip>
#include <optional>
#include <stack>

using namespace bb::plookup;
using namespace bb;

namespace cdg {

/**
 * @brief this method processes variables from a gate by removing duplicates and updating tracking structures
 * @tparam FF field type
 * @tparam CircuitBuilder
 * @param gate_variables vector of variables to process
 * @param gate_index index of the current gate
 * @param blk reference to the block containing the gate
 * @details The method performs several operations:
 *          1) Removes duplicate variables from the input vector
 *          2) Converts each variable to its real index using to_real
 *          3) Creates key-value pairs of (variable_index, block_pointer) for tracking
 *          4) Updates variable_gates map with gate indices for each variable
 *          5) Increments the gate count for each processed variable
 */
template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::process_gate_variables(std::vector<uint32_t>& gate_variables,
                                                                        size_t gate_index,
                                                                        auto& blk)
{
    auto unique_variables = std::unique(gate_variables.begin(), gate_variables.end());
    gate_variables.erase(unique_variables, gate_variables.end());
    if (gate_variables.empty()) {
        return;
    }
    for (auto& var_idx : gate_variables) {
        KeyPair key = std::make_pair(var_idx, &blk);
        variable_gates[key].emplace_back(gate_index);
    }
    for (const auto& variable_index : gate_variables) {
        variables_gate_counts[variable_index] += 1;
    }
}

/**
 * @brief Extract gate variables using a declarative pattern
 *
 * This method uses a GatePattern to determine which wires are constrained by a gate,
 * then extracts the variable indices from those wire positions.
 *
 * @param index Gate index within the block
 * @param blk The block containing the gate
 * @param pattern The GatePattern describing which wires are constrained
 * @param gate_selector_column The selector column for this gate type (e.g., q_arith, q_elliptic)
 * @param filter_zero_idx If true, filter out zero_idx variables (used for gates with padding)
 * @return Vector of real variable indices constrained by this gate
 */
template <typename FF, typename CircuitBuilder>
template <typename Block, typename GateSelectorColumn>
std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::extract_gate_variables(
    size_t index,
    Block& blk,
    const bb::gate_patterns::GatePattern& pattern,
    const GateSelectorColumn& gate_selector_column,
    bool filter_zero_idx)
{
    using namespace bb::gate_patterns;

    // Check if gate selector is active
    if (gate_selector_column[index].is_zero()) {
        return {};
    }

    // Read selectors and extract wire indices using the pattern
    Selectors selectors = read_selectors(blk, index, gate_selector_column);
    std::vector<uint32_t> gate_variables = extract_wires(blk, index, pattern, selectors);

    // Optionally filter out zero_idx (used for gates that pad with zero_idx)
    if (filter_zero_idx) {
        std::erase(gate_variables, circuit_builder.zero_idx());
    }

    // Convert to real indices and process
    gate_variables = to_real(gate_variables);
    process_gate_variables(gate_variables, index, blk);
    return gate_variables;
}

/**
 * @brief this method gets the ROM table connected component by processing ROM transcript records
 * @tparam FF field type
 * @tparam CircuitBuilder
 * @param rom_array ROM transcript containing records with witness indices and gate information
 * @return std::vector<uint32_t> vector of connected variables from ROM table gates
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_rom_table_connected_component(
    const bb::RomTranscript& rom_array)
{
    // Every RomTranscript data structure has 2 main components that are interested for static analyzer:
    // 1) records contains values that were put in the gate, we can use them to create connections between variables
    // 2) states contains values witness indexes that we can find in the ROM record in the RomTrascript, so we can
    // ignore state of the ROM transcript, because we still can connect all variables using variables from records.
    std::vector<uint32_t> rom_table_variables;
    auto& memory_block = circuit_builder.blocks.memory;
    for (const auto& record : rom_array.records) {
        std::vector<uint32_t> gate_variables;
        size_t gate_index = record.gate_index;

        auto q_1 = memory_block.q_1()[gate_index];
        auto q_2 = memory_block.q_2()[gate_index];
        auto q_3 = memory_block.q_3()[gate_index];
        auto q_4 = memory_block.q_4()[gate_index];
        auto q_m = memory_block.q_m()[gate_index];
        auto q_c = memory_block.q_c()[gate_index];

        auto index_witness = record.index_witness;
        auto vc1_witness = record.value_column1_witness; // state[0] from RomTranscript
        auto vc2_witness = record.value_column2_witness; // state[1] from RomTranscript
        auto record_witness = record.record_witness;

        if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() && q_c.is_zero()) {
            // By default ROM read gate uses variables (w_1, w_2, w_3, w_4) = (index_witness, vc1_witness,
            // vc2_witness, record_witness) So we can update all of them
            gate_variables.emplace_back(index_witness);
            if (vc1_witness != circuit_builder.zero_idx()) {
                gate_variables.emplace_back(vc1_witness);
            }
            if (vc2_witness != circuit_builder.zero_idx()) {
                gate_variables.emplace_back(vc2_witness);
            }
            gate_variables.emplace_back(record_witness);
        }
        gate_variables = to_real(gate_variables);
        process_gate_variables(gate_variables, gate_index, memory_block);
        // after process_gate_variables function gate_variables constists of real variables indexes, so we can
        // add all this variables in the final vector to connect all of them
        if (!gate_variables.empty()) {
            rom_table_variables.insert(rom_table_variables.end(), gate_variables.begin(), gate_variables.end());
        }
    }
    return rom_table_variables;
}

/**
 * @brief this method gets the RAM table connected component by processing RAM transcript records
 * @tparam FF field type
 * @param CircuitBuilder
 * @param ram_array RAM transcript containing records with witness indices and gate information
 * @return std::vector<uint32_t> vector of connected variables from RAM table gates
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_ram_table_connected_component(
    const bb::RamTranscript& ram_array)
{
    std::vector<uint32_t> ram_table_variables;
    auto& memory_block = circuit_builder.blocks.memory;
    for (const auto& record : ram_array.records) {
        std::vector<uint32_t> gate_variables;
        size_t gate_index = record.gate_index;

        auto q_1 = memory_block.q_1()[gate_index];
        auto q_2 = memory_block.q_2()[gate_index];
        auto q_3 = memory_block.q_3()[gate_index];
        auto q_4 = memory_block.q_4()[gate_index];
        auto q_m = memory_block.q_m()[gate_index];
        auto q_c = memory_block.q_c()[gate_index];

        auto index_witness = record.index_witness;
        auto timestamp_witness = record.timestamp_witness;
        auto value_witness = record.value_witness;
        auto record_witness = record.record_witness;

        if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
            (q_c.is_zero() || q_c == FF::one())) {
            // By default RAM read/write gate uses variables (w_1, w_2, w_3, w_4) = (index_witness,
            // timestamp_witness, value_witness, record_witness) So we can update all of them
            gate_variables.emplace_back(index_witness);
            if (timestamp_witness != circuit_builder.zero_idx()) {
                gate_variables.emplace_back(timestamp_witness);
            }
            if (value_witness != circuit_builder.zero_idx()) {
                gate_variables.emplace_back(value_witness);
            }
            gate_variables.emplace_back(record_witness);
        }
        gate_variables = to_real(gate_variables);
        process_gate_variables(gate_variables, gate_index, memory_block);
        // after process_gate_variables function gate_variables constists of real variables indexes, so we can add
        // all these variables in the final vector to connect all of them
        ram_table_variables.insert(ram_table_variables.end(), gate_variables.begin(), gate_variables.end());
    }
    return ram_table_variables;
}

/**
 * @brief this method creates connected components from elliptic curve operation gates
 * @tparam FF field type
 * @param CircuitBuilder
 * @param index index of the current gate
 * @param blk block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Processes elliptic curve operations by collecting variables from current and next gates,
 *          handling opcodes and coordinate variables for curve operations.
 *          Only processes gates in the ecc_op block - returns empty for other blocks.
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_eccop_part_connected_component(size_t index,
                                                                                                     auto& blk)
{
    std::vector<uint32_t> gate_variables;

    // Only process gates in the ecc_op block. The condition w1 != zero_idx is too broad and would
    // match almost any gate in other blocks, causing false connections.
    if constexpr (IsMegaBuilder<CircuitBuilder>) {
        if (&blk != &circuit_builder.blocks.ecc_op) {
            return gate_variables;
        }
    }

    std::vector<uint32_t> first_row_variables;
    std::vector<uint32_t> second_row_variables;
    auto w1 = blk.w_l()[index]; // get opcode of operation, because function get_ecc_op_idx returns type
                                // uint32_t and it adds as w1
    if (w1 != circuit_builder.zero_idx()) {
        // this is opcode and start of the UltraOp element
        first_row_variables.insert(
            first_row_variables.end(),
            { w1, blk.w_r()[index], blk.w_o()[index], blk.w_4()[index] }); // add op, x_lo, x_hi, y_lo
        if (index < blk.size() - 1) {
            second_row_variables.insert(
                second_row_variables.end(),
                { blk.w_r()[index + 1], blk.w_o()[index + 1], blk.w_4()[index + 1] }); // add y_hi, z1, z2
        }
        first_row_variables = to_real(first_row_variables);
        second_row_variables = to_real(second_row_variables);
        process_gate_variables(first_row_variables, index, blk);
        process_gate_variables(second_row_variables, index, blk);
    }
    if (!first_row_variables.empty()) {
        gate_variables.insert(gate_variables.end(), first_row_variables.cbegin(), first_row_variables.cend());
    }
    if (!second_row_variables.empty()) {
        gate_variables.insert(gate_variables.end(), second_row_variables.cbegin(), second_row_variables.cend());
    }
    return gate_variables;
}

template <typename FF, typename CircuitBuilder> void StaticAnalyzer_<FF, CircuitBuilder>::process_execution_trace()
{
    using namespace bb::gate_patterns;

    for (auto& blk : circuit_builder.blocks.get()) {
        if (blk.size() == 0 || &blk == &circuit_builder.blocks.pub_inputs) {
            continue;
        }

        std::vector<uint32_t> eccop_variables;
        for (size_t gate_idx = 0; gate_idx < blk.size(); gate_idx++) {
            // Try each pattern until one matches (returns non-empty)
            std::vector<uint32_t> cc;
            auto try_pattern = [&](const GatePattern& pattern, const auto& selector, bool filter_zero = false) {
                if (cc.empty()) {
                    cc = extract_gate_variables(gate_idx, blk, pattern, selector, filter_zero);
                }
            };

            // Standard gate patterns (mutually exclusive - at most one will match)
            try_pattern(ARITHMETIC, blk.q_arith());
            try_pattern(ELLIPTIC, blk.q_elliptic());
            try_pattern(LOOKUP, blk.q_lookup());
            try_pattern(POSEIDON2_INTERNAL, blk.q_poseidon2_internal());
            try_pattern(POSEIDON2_EXTERNAL, blk.q_poseidon2_external());
            try_pattern(NON_NATIVE_FIELD, blk.q_nnf());
            try_pattern(MEMORY, blk.q_memory());                 // access gates handled by ROM/RAM transcripts
            try_pattern(DELTA_RANGE, blk.q_delta_range(), true); // filter zero_idx for range lists

            if (!cc.empty() && connect_variables) {
                connect_all_variables_in_vector(cc);
            }

            // MegaBuilder-specific patterns
            if constexpr (IsMegaBuilder<CircuitBuilder>) {
                auto databus_cc = extract_gate_variables(gate_idx, blk, DATABUS, blk.q_busread(), false);
                if (!databus_cc.empty() && connect_variables) {
                    connect_all_variables_in_vector(databus_cc);
                }

                auto eccop_cc = get_eccop_part_connected_component(gate_idx, blk);
                if (!eccop_cc.empty() && connect_variables) {
                    eccop_variables.insert(eccop_variables.end(), eccop_cc.begin(), eccop_cc.end());
                    if (eccop_cc[0] == circuit_builder.equality_op_idx) {
                        connect_all_variables_in_vector(eccop_variables);
                        eccop_variables.clear();
                    }
                }
            }
        }
    }

    const auto& rom_arrays = circuit_builder.rom_ram_logic.rom_arrays;
    if (!rom_arrays.empty()) {
        for (const auto& rom_array : rom_arrays) {
            std::vector<uint32_t> variable_indices = get_rom_table_connected_component(rom_array);
            if (connect_variables) {
                connect_all_variables_in_vector(variable_indices);
            }
        }
    }

    const auto& ram_arrays = circuit_builder.rom_ram_logic.ram_arrays;
    if (!ram_arrays.empty()) {
        for (const auto& ram_array : ram_arrays) {
            std::vector<uint32_t> variable_indices = get_ram_table_connected_component(ram_array);
            if (connect_variables) {
                connect_all_variables_in_vector(variable_indices);
            }
        }
    }
}

/**
 * @brief Construct a new StaticAnalyzer for Ultra Circuit Builder or Mega Circuit Builder
 * @tparam FF field type used in the circuit
 * @tparam CircuitBuilder
 * @param CircuitBuilder
 * @param connect_variables
 * @details This constructor initializes the graph structure by:
 *          1) Creating data structures for tracking:
 *             - Number of gates each variable appears in (variables_gate_counts)
 *             - Adjacency lists for each variable (variable_adjacency_lists)
 *             - Degree of each variable (variables_degree)
 *          2) Processing different types of gates:
 *             - Arithmetic gates
 *             - Elliptic curve gates
 *             - Plookup gates
 *             - Poseidon2 gates
 *             - Memory gates
 *             - Non-native field gates
 *             - Delta range gates
 *          3) Creating connections between variables that appear in the same gate
 *          4) Special handling for sorted constraints in delta range blocks
 */
template <typename FF, typename CircuitBuilder>
StaticAnalyzer_<FF, CircuitBuilder>::StaticAnalyzer_(CircuitBuilder& circuit_builder, bool connect_variables)
    : circuit_builder(circuit_builder)
    , connect_variables(connect_variables)
{
    variables_gate_counts = std::unordered_map<uint32_t, size_t>(circuit_builder.real_variable_index.size());
    variable_adjacency_lists =
        std::unordered_map<uint32_t, std::vector<uint32_t>>(circuit_builder.real_variable_index.size());
    variables_degree = std::unordered_map<uint32_t, size_t>(circuit_builder.real_variable_index.size());
    for (const auto& variable_index : circuit_builder.real_variable_index) {
        variables_gate_counts[variable_index] = 0;
        variables_degree[variable_index] = 0;
        variable_adjacency_lists[variable_index] = {};
    }
    save_constant_variable_indices();
    process_execution_trace();
}

/**
 * @brief this method needs to save all constant variables indices in one data structure
 * in order to not go through whole map constant variable indices every time when tool checks
 * that variable isn't constant
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::save_constant_variable_indices()
{
    constant_variable_indices_set.clear();
    const auto& constant_variable_indices = circuit_builder.constant_variable_indices;
    for (const auto& pair : constant_variable_indices) {
        constant_variable_indices_set.insert(pair.second);
    }
}

/**
 * @brief this method checks whether the variable with given index is not constant
 * @tparam FF
 * @tparam CircuitBuilder
 * @param variable_index
 */

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::check_is_not_constant_variable(const uint32_t& variable_index)
{
    uint32_t real_variable_index = circuit_builder.real_variable_index[variable_index];
    return constant_variable_indices_set.find(real_variable_index) == constant_variable_indices_set.end();
}

/**
 * @brief this method connects 2 variables if they are in one gate and
 * 1) have different indices,
 * 2) not constant variables,
 * 3) their indices != 0
 * @tparam FF
 * @tparam CircuitBuilder
 * @param variables_vector
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::connect_all_variables_in_vector(const std::vector<uint32_t>& variables_vector)
{
    if (variables_vector.empty()) {
        return;
    }
    std::vector<uint32_t> filtered_variables_vector;
    filtered_variables_vector.reserve(variables_vector.size());
    // Only copy non-zero and non-constant variables
    std::copy_if(variables_vector.begin(),
                 variables_vector.end(),
                 std::back_inserter(filtered_variables_vector),
                 [&](uint32_t variable_index) {
                     return variable_index != circuit_builder.zero_idx() &&
                            this->check_is_not_constant_variable(variable_index);
                 });
    // Remove duplicates
    auto unique_pointer = std::unique(filtered_variables_vector.begin(), filtered_variables_vector.end());
    filtered_variables_vector.erase(unique_pointer, filtered_variables_vector.end());
    if (filtered_variables_vector.size() < 2) {
        return;
    }
    for (size_t i = 0; i < filtered_variables_vector.size() - 1; i++) {
        add_new_edge(filtered_variables_vector[i], filtered_variables_vector[i + 1]);
    }
}

/**
 * @brief this method creates an edge between two variables in graph. All needed checks in a function above
 * @tparam FF
 * @tparam CircuitBuilder
 * @param first_variable_index
 * @param second_variable_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::add_new_edge(const uint32_t& first_variable_index,
                                                       const uint32_t& second_variable_index)
{
    variable_adjacency_lists[first_variable_index].emplace_back(second_variable_index);
    variable_adjacency_lists[second_variable_index].emplace_back(first_variable_index);
    variables_degree[first_variable_index] += 1;
    variables_degree[second_variable_index] += 1;
}

/**
 * @brief this method implements depth-first search algorithm for undirected graphs
 * @tparam FF
 * @tparam CircuitBuilder
 * @param variable_index
 * @param is_used
 * @param connected_component
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::depth_first_search(const uint32_t& variable_index,
                                                             std::unordered_set<uint32_t>& is_used,
                                                             std::vector<uint32_t>& connected_component)
{
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

/**
 * @brief this methond finds all connected components in the graph described by adjacency lists and
 * marks some of them as connected components that were created with functions in method finalize_circuit
 * @tparam FF
 * @tparam CircuitBuilder
 * @return std::vector<std::vector<uint32_t>> list of connected components where each component is a vector of
 * variable indices
 */

template <typename FF, typename CircuitBuilder>
std::vector<ConnectedComponent> StaticAnalyzer_<FF, CircuitBuilder>::find_connected_components()
{
    if (!connect_variables) {
        throw std::runtime_error("find_connected_components() can only be called when connect_variables is true");
    }
    connected_components.clear();
    std::unordered_set<uint32_t> visited;
    for (const auto& pair : variable_adjacency_lists) {
        if (pair.first != 0 && variables_degree[pair.first] > 0) {
            if (!visited.contains(pair.first)) {
                std::vector<uint32_t> variable_indices;
                depth_first_search(pair.first, visited, variable_indices);
                std::sort(variable_indices.begin(), variable_indices.end());
                connected_components.emplace_back(ConnectedComponent(variable_indices));
            }
        }
    }
    mark_range_list_connected_components();
    mark_finalize_connected_components();
    mark_process_rom_connected_component();
    return connected_components;
}

/**
 * @brief this method checks if current gate is sorted ROM gate
 * @tparam FF
 * @tparam CircuitBuilder
 * @param memory_block reference to the memory block
 * @param gate_idx
 */

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::is_gate_sorted_rom(auto& memory_block, size_t gate_idx) const
{
    return memory_block.q_memory()[gate_idx] == FF::one() && memory_block.q_1()[gate_idx] == FF::one() &&
           memory_block.q_2()[gate_idx] == FF::one();
}

/**
 * @brief this method checks that every gate for given variable in a given block is sorted ROM gate
 * @tparam FF
 * @tparam CircuitBuilder
 * @param var_idx
 * @param blk reference to the block
 */

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::variable_only_in_sorted_rom_gates(uint32_t var_idx, auto& blk) const
{
    bool result = false;
    KeyPair key = { var_idx, &blk };
    auto it = variable_gates.find(key);
    if (it != variable_gates.end()) {
        const auto& gates = it->second;
        result = std::all_of(
            gates.begin(), gates.end(), [this, &blk](size_t gate_idx) { return is_gate_sorted_rom(blk, gate_idx); });
    }
    return result;
}

/**
 * @brief this method marks some connected components if they were created by function process_rom_array.
 * the point is process_ROM_array function uses only create_sorted_ROM_gate function internally
 * for sorted_ROM_gate we know that (q_memory, q_1, q_2) == (1, 1, 1), so if all variables in connected_component
 * are contained only in this type of gate, we can remove this connected component from the scope, cause it's
 * a result of process_ROM_array function
 * @tparam FF
 * @tparam CircuitBuilder
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::mark_process_rom_connected_component()
{
    auto& memory_block = circuit_builder.blocks.memory;
    for (auto& cc : connected_components) {
        const std::vector<uint32_t>& variables = cc.vars();
        cc.is_process_rom_cc =
            std::all_of(variables.begin(), variables.end(), [this, &memory_block](uint32_t real_var_idx) {
                return variable_only_in_sorted_rom_gates(real_var_idx, memory_block);
            });
    }
}

/**
 * @brief this method marks some connected componets like they represent range lists
 * tool needs this method to remove range lists because after method finalize was called
 * because they aren't connected to other variables in a circuit. It's intended behaviout but the tool shows them as
 * another connected component
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::mark_range_list_connected_components()
{
    const auto& tags = circuit_builder.real_variable_tags;
    std::unordered_set<uint32_t> tau_tags;
    for (const auto& pair : circuit_builder.range_lists) {
        tau_tags.insert(pair.second.tau_tag);
    }
    for (auto& cc : connected_components) {
        const auto& variables = cc.variable_indices;
        const uint32_t first_tag = tags[variables[0]];
        if (tau_tags.contains(first_tag)) {
            cc.is_range_list_cc =
                std::all_of(variables.begin() + 1, variables.end(), [&tags, first_tag](uint32_t var_idx) {
                    return tags[var_idx] == first_tag;
                });
        }
    }
}

/**
 * @brief this method marks some connected components like they represent separated finalize blocks
 * the point is finalize method create additional gates for ecc_op in databus in Mega case and they aren't connected
 * to other variables in the circuit. It's intended behaviour but the tool shows them as another connected component
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::mark_finalize_connected_components()
{
    const auto& finalize_witnesses = circuit_builder.get_finalize_witnesses();
    for (auto& cc : connected_components) {
        const auto& vars = cc.vars();
        cc.is_finalize_cc = std::all_of(vars.begin(), vars.end(), [&finalize_witnesses](uint32_t var_idx) {
            return finalize_witnesses.contains(var_idx);
        });
    }
}

/**
 * @brief this method removes variables that were created in a function decompose_into_default_range
 * because they are false cases and don't give any useful information about security of the circuit.
 * decompose_into_default_range function creates addition gates with shifts for intermediate variables,
 * i.e. variables from left, right and output wires. They have variable gates count = 1 or 2, but they are not
 * dangerous. so, we have to remove these variables from the analyzer. The situation is dangerous, if first variable
 * from accumulators have variables gate count = 1. It means that it was used only in decompose gate, and it's not
 * properly constrained.
 * @tparam FF
 * @tparam CircuitBuilder
 * @param ultra_circuit_constructor
 * @param variables_in_one_gate
 * @param index
 * @return size_t
 */

template <typename FF, typename CircuitBuilder>
inline size_t StaticAnalyzer_<FF, CircuitBuilder>::process_current_decompose_chain(size_t index)
{
    auto& arithmetic_block = circuit_builder.blocks.arithmetic;
    auto zero_idx = circuit_builder.zero_idx();
    size_t current_index = index;
    std::vector<uint32_t> accumulators_indices;
    while (true) {
        // we have to remove left, right and output wires of the current gate, cause they'are new_limbs, and they
        // are useless for the analyzer
        auto fourth_idx = arithmetic_block.w_4()[current_index];
        accumulators_indices.emplace_back(this->to_real(fourth_idx));
        auto left_idx = arithmetic_block.w_l()[current_index];
        if (left_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(left_idx));
        }
        auto right_idx = arithmetic_block.w_r()[current_index];
        if (right_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(right_idx));
        }
        auto out_idx = arithmetic_block.w_o()[current_index];
        if (out_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(out_idx));
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
            // the first variable in accumulators is the variable which decompose was created. So, we have to
            // decrement variable_gate_counts for this variable
            variables_gate_counts[accumulators_indices[i]] -= 1;
        } else {
            // next accumulators are useless variables that are not interested for the analyzer. So, for these
            // variables we can nullify variables_gate_counts
            variables_gate_counts[accumulators_indices[i]] = 0;
        }
    }
    // we don't want to make variables_gate_counts for intermediate variables negative, so, can go to the next gates
    return current_index;
}

/**
 * @brief this method removes unnecessary variables from decompose chains
 * @tparam FF
 * @tparam CircuitBuilder
 * @param variables_in_one_gate
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_decompose_variables(
    const std::unordered_set<uint32_t>& decompose_variables)
{
    auto is_power_two = [&](const uint256_t& number) { return number > 0 && ((number & (number - 1)) == 0); };
    auto find_position = [&](uint32_t variable_index) {
        return decompose_variables.contains(this->to_real(variable_index));
    };
    auto& arithmetic_block = circuit_builder.blocks.arithmetic;
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
                    i = this->process_current_decompose_chain(i);
                }
            }
        }
    }
}

/**
 * @brief this method removes variables from range constraints that are not security critical
 * @tparam FF field type
 * @tparam CircuitBuilder
 * @details Right now static analyzer removes two types of variables:
 *          1) Variables from delta_range_constraints created by finalize_circuit()
 *          2) Variables from range_constraints created by range_constraint_into_two_limbs
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_range_constrains_variables()
{
    const auto& range_lists = circuit_builder.range_lists;
    std::unordered_set<uint32_t> range_lists_tau_tags;
    std::unordered_set<uint32_t> range_lists_range_tags;
    const auto& real_variable_tags = circuit_builder.real_variable_tags;
    for (const auto& pair : range_lists) {
        typename CircuitBuilder::RangeList list = pair.second;
        range_lists_tau_tags.insert(list.tau_tag);
        range_lists_range_tags.insert(list.range_tag);
    }
    for (uint32_t real_index = 0; real_index < real_variable_tags.size(); real_index++) {
        if (variables_in_one_gate.contains(real_index)) {
            // this if helps us to remove variables from delta_range_constraints when finalize_circuit() function
            // was called
            if (range_lists_tau_tags.contains(real_variable_tags[real_index])) {
                variables_in_one_gate.erase(real_index);
            }
            // this if helps us to remove variables from range_constraints when range_constraint_into_two_limbs
            // function was called
            if (range_lists_range_tags.contains(real_variable_tags[real_index])) {
                variables_in_one_gate.erase(real_index);
            }
        }
    }
}

/**
 * @brief this method removes false positive cases variables from aes plookup tables.
 * AES_SBOX_MAP, AES_SPARSE_MAP, AES_SPARSE_NORMALIZE tables are used in read_from_1_to_2_table function which
 * return values C2[0], so C3[0] isn't used anymore in these cases, but this situation isn't dangerous.
 * So, we have to remove these variables.
 * @tparam FF
 * @tparam CircuitBuilder
 * @param table_id
 * @param gate_index
 */
template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_aes_plookup_variables(BasicTableId& table_id,
                                                                                          size_t gate_index)
{

    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    std::unordered_set<BasicTableId> aes_plookup_tables{ BasicTableId::AES_SBOX_MAP,
                                                         BasicTableId::AES_SPARSE_MAP,
                                                         BasicTableId::AES_SPARSE_NORMALIZE };
    auto& lookup_block = circuit_builder.blocks.lookup;
    if (aes_plookup_tables.contains(table_id)) {
        uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
        uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            bool find_out = find_position(real_out_idx);
            auto q_c = lookup_block.q_c()[gate_index];
            if (q_c.is_zero()) {
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
        }
    }
}

/**
 * @brief this method removes false cases in sha256 lookup tables.
 * tables which are enumerated in the unordered set sha256_plookup_tables
 * are used in read_from_1_to_2_table function which return C2[0], so C3[0]
 * isn't used anymore, but this situation isn't dangerous. So, we have to remove these variables.
 * @tparam FF
 * @tparam CircuitBuilder
 * @param table_id
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_sha256_plookup_variables(BasicTableId& table_id,
                                                                                             size_t gate_index)
{
    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = circuit_builder.blocks.lookup;
    std::unordered_set<BasicTableId> sha256_plookup_tables{ BasicTableId::SHA256_WITNESS_SLICE_3,
                                                            BasicTableId::SHA256_WITNESS_SLICE_7_ROTATE_4,
                                                            BasicTableId::SHA256_WITNESS_SLICE_8_ROTATE_7,
                                                            BasicTableId::SHA256_WITNESS_SLICE_14_ROTATE_1,
                                                            BasicTableId::SHA256_BASE16,
                                                            BasicTableId::SHA256_BASE16_ROTATE2,
                                                            BasicTableId::SHA256_BASE28,
                                                            BasicTableId::SHA256_BASE28_ROTATE3,
                                                            BasicTableId::SHA256_BASE28_ROTATE6 };
    if (sha256_plookup_tables.contains(table_id)) {
        uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
        uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            // auto q_m = lookup_block.q_m()[gate_index];
            auto q_c = lookup_block.q_c()[gate_index];
            bool find_out = find_position(real_out_idx);
            // bool find_right = find_position(real_right_idx);
            if (q_c.is_zero()) {
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
            if (table_id == SHA256_BASE16_ROTATE2 || table_id == SHA256_BASE28_ROTATE6) {
                // we want to remove false cases for special tables even though their selectors != 0
                // because they are used in read_from_1_to_2_table function, and they aren't dangerous
                variables_in_one_gate.erase(real_out_idx);
            }
        }
    }
}

/**
 * @brief this method removes false cases in lookup table for a given gate.
 * it uses all functions above for lookup tables to remove all variables that appear in one gate,
 * if they are not dangerous
 * @tparam FF
 * @tparam CircuitBuilder
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::process_current_plookup_gate(size_t gate_index)
{
    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = circuit_builder.blocks.lookup;
    auto& lookup_tables = circuit_builder.get_lookup_tables();
    auto table_index = static_cast<size_t>(static_cast<uint256_t>(lookup_block.q_3()[gate_index]));
    for (const auto& table : lookup_tables) {
        if (table.table_index == table_index) {
            std::unordered_set<bb::fr> column_1(table.column_1.begin(), table.column_1.end());
            std::unordered_set<bb::fr> column_2(table.column_2.begin(), table.column_2.end());
            std::unordered_set<bb::fr> column_3(table.column_3.begin(), table.column_3.end());
            bb::plookup::BasicTableId table_id = table.id;
            // false cases for AES
            this->remove_unnecessary_aes_plookup_variables(table_id, gate_index);
            // false cases for sha256
            this->remove_unnecessary_sha256_plookup_variables(table_id, gate_index);
            // if the amount of unique elements from columns of plookup tables = 1, it means that
            // variable from this column aren't used and we can remove it.
            if (column_1.size() == 1) {
                uint32_t left_idx = lookup_block.w_l()[gate_index];
                uint32_t real_left_idx = this->to_real(left_idx);
                bool find_left = find_position(real_left_idx);
                if (find_left) {
                    variables_in_one_gate.erase(real_left_idx);
                }
            }
            if (column_2.size() == 1) {
                uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
                bool find_right = find_position(real_right_idx);
                if (find_right) {
                    variables_in_one_gate.erase(real_right_idx);
                }
            }
            if (column_3.size() == 1) {
                uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
                bool find_out = find_position(real_out_idx);
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
        }
    }
}

/**
 * @brief this method removes false cases plookup variables from variables in one gate
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_plookup_variables()
{
    auto& lookup_block = circuit_builder.blocks.lookup;
    if (lookup_block.size() > 0) {
        for (size_t i = 0; i < lookup_block.size(); i++) {
            this->process_current_plookup_gate(i);
        }
    }
}

/**
 * @brief this method removes record witness variables from variables in one gate.
 * initially record witness is added in the circuit as ctx->add_variable(0), where ctx -- circuit builder.
 * then aren't used anymore, so we can remove from the static analyzer.
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_record_witness_variables()
{
    auto& memory_block = circuit_builder.blocks.memory;
    std::vector<uint32_t> to_remove;
    for (const auto& var_idx : variables_in_one_gate) {
        KeyPair key = { var_idx, &memory_block };
        if (auto search = variable_gates.find(key); search != variable_gates.end()) {
            std::vector<size_t> gate_indexes = variable_gates[key];
            BB_ASSERT_EQ(gate_indexes.size(), 1U);
            size_t gate_idx = gate_indexes[0];
            auto q_1 = memory_block.q_1()[gate_idx];
            auto q_2 = memory_block.q_2()[gate_idx];
            auto q_3 = memory_block.q_3()[gate_idx];
            auto q_4 = memory_block.q_4()[gate_idx];
            auto q_m = memory_block.q_m()[gate_idx];
            auto q_arith = memory_block.q_arith()[gate_idx];
            if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
                q_arith.is_zero()) {
                // record witness can be in both ROM and RAM gates, so we can ignore q_c
                // record witness is written as 4th variable in RAM/ROM read/write gate, so we can get 4th
                // wire value and check it with our variable
                if (this->to_real(memory_block.w_4()[gate_idx]) == var_idx) {
                    to_remove.emplace_back(var_idx);
                }
            }
        }
    }
    for (const auto& elem : to_remove) {
        variables_in_one_gate.erase(elem);
    }
}

/**
 * @brief this method returns a final set of variables that were in one gate
 * @tparam FF
 * @tparam CircuitBuilder
 * @return std::unordered_set<uint32_t> set of variable indices
 */

template <typename FF, typename CircuitBuilder>
std::unordered_set<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_variables_in_one_gate()
{
    variables_in_one_gate.clear();
    for (const auto& pair : variables_gate_counts) {
        bool is_not_constant_variable = check_is_not_constant_variable(pair.first);
        if (pair.second == 1 && pair.first != 0 && is_not_constant_variable) {
            variables_in_one_gate.insert(pair.first);
        }
    }
    auto range_lists = circuit_builder.range_lists;
    std::unordered_set<uint32_t> decompose_variables;
    for (auto& pair : range_lists) {
        for (auto& elem : pair.second.variable_indices) {
            bool is_not_constant_variable = check_is_not_constant_variable(elem);
            if (variables_gate_counts[circuit_builder.real_variable_index[elem]] == 1 && is_not_constant_variable) {
                decompose_variables.insert(circuit_builder.real_variable_index[elem]);
            }
        }
    }
    remove_unnecessary_decompose_variables(decompose_variables);
    remove_unnecessary_plookup_variables();
    remove_unnecessary_range_constrains_variables();

    // Remove variables that are intentionally in one gate (e.g., fix_witness, inverse checks).
    // These are marked at the source via update_used_witnesses().
    for (const auto& elem : circuit_builder.get_used_witnesses()) {
        variables_in_one_gate.erase(elem);
    }
    remove_record_witness_variables();

    // Remove variables that only appear in sorted ROM gates - these are constrained via tau tags
    // (permutation argument) rather than copy constraints, matching how connected components
    // are filtered with is_process_rom_cc
    auto& memory_block = circuit_builder.blocks.memory;
    std::vector<uint32_t> to_remove;
    for (const auto& var_idx : variables_in_one_gate) {
        if (variable_only_in_sorted_rom_gates(var_idx, memory_block)) {
            to_remove.emplace_back(var_idx);
        }
    }
    for (const auto& elem : to_remove) {
        variables_in_one_gate.erase(elem);
    }

    return variables_in_one_gate;
}

/**
 * @brief this method prints additional information about connected components that were found in the graph
 * @tparam FF
 * @tparam CircuitBuilder
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_connected_components_info()
{
    info("╔═══════╦═══════╦═════════════╦═══════════╦══════════════╗");
    info("║  CC#  ║  Size ║ Range List  ║ Finalize  ║ Process ROM  ║");
    info("╠═══════╬═══════╬═════════════╬═══════════╬══════════════╣");

    for (size_t i = 0; i < connected_components.size(); i++) {
        const auto& cc = connected_components[i];
        std::ostringstream line;

        line << "║ " << std::setw(5) << std::right << (i + 1) << " ║ " << std::setw(5) << std::right << cc.size()
             << " ║ " << std::setw(11) << std::left << (cc.is_range_list_cc ? "Yes" : "No") << " ║ " << std::setw(9)
             << std::left << (cc.is_finalize_cc ? "Yes" : "No") << " ║ " << std::setw(12) << std::left
             << (cc.is_process_rom_cc ? "Yes" : "No") << " ║";
        info(line.str());
    }
    info("╚═══════╩═══════╩═════════════╩═══════════╩══════════════╝");
    info("Total connected components: ", connected_components.size());
}

/**
 * @brief this method prints a number of gates for each variable
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder> void StaticAnalyzer_<FF, CircuitBuilder>::print_variables_gate_counts()
{
    for (const auto& it : variables_gate_counts) {
        info("number of gates with variables ", it.first, " == ", it.second);
    }
}

/**
 * @brief this method prints all information about arithmetic gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_arithmetic_gate_info(size_t gate_index, auto& block)
{
    auto q_arith = block.q_arith()[gate_index];
    if (!q_arith.is_zero()) {
        info("q_arith == ", q_arith);
        // fisrtly, print selectors for standard plonk gate
        info("q_m == ", block.q_m()[gate_index]);
        info("q1 == ", block.q_1()[gate_index]);
        info("q2 == ", block.q_2()[gate_index]);
        info("q3 == ", block.q_3()[gate_index]);
        info("q4 == ", block.q_4()[gate_index]);
        info("q_c == ", block.q_c()[gate_index]);

        if (q_arith == FF(2)) {
            // we have to print w_4_shift from next gate
            info("w_4_shift == ", block.w_4()[gate_index + 1]);
        }
        if (q_arith == FF(3)) {
            // we have to print w_4_shift and w_1_shift from the next gate
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
            info("w_4_shift == ", block.w_4()[gate_index + 1]);
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about elliptic gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_elliptic_gate_info(size_t gate_index, auto& block)
{
    auto q_elliptic = block.q_elliptic()[gate_index];
    if (!q_elliptic.is_zero()) {
        info("q_elliptic == ", q_elliptic);
        info("q_1 == ", block.q_1()[gate_index]);
        info("q_m == ", block.q_m()[gate_index]);
        bool is_elliptic_add_gate = !block.q_1()[gate_index].is_zero() && block.q_m()[gate_index].is_zero();
        bool is_elliptic_dbl_gate = block.q_1()[gate_index].is_zero() && block.q_m()[gate_index] == FF::one();
        if (is_elliptic_add_gate) {
            info("x2 == ", block.w_l()[gate_index + 1]);
            info("x3 == ", block.w_r()[gate_index + 1]);
            info("y3 == ", block.w_o()[gate_index + 1]);
            info("y2 == ", block.w_4()[gate_index + 1]);
        }
        if (is_elliptic_dbl_gate) {
            info("x3 == ", block.w_r()[gate_index + 1]);
            info("y3 == ", block.w_o()[gate_index + 1]);
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about plookup gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_plookup_gate_info(size_t gate_index, auto& block)
{
    auto q_lookup = block.q_lookup()[gate_index];
    if (!q_lookup.is_zero()) {
        info("q_lookup == ", q_lookup);
        auto q_2 = block.q_2()[gate_index];
        auto q_m = block.q_m()[gate_index];
        auto q_c = block.q_c()[gate_index];
        info("q_2 == ", q_2);
        info("q_m == ", q_m);
        info("q_c == ", q_c);
        if (!q_2.is_zero()) {
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
        }
        if (!q_m.is_zero()) {
            info("w_2_shift == ", block.w_r()[gate_index + 1]);
        }
        if (!q_c.is_zero()) {
            info("w_3_shift == ", block.w_o()[gate_index + 1]);
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about range constrain gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_delta_range_gate_info(size_t gate_index, auto& block)
{
    auto q_delta_range = block.q_delta_range()[gate_index];
    if (!q_delta_range.is_zero()) {
        info("q_delta_range == ", q_delta_range);
        info("w_1 == ", block.w_l()[gate_index]);
        info("w_2 == ", block.w_r()[gate_index]);
        info("w_3 == ", block.w_o()[gate_index]);
        info("w_4 == ", block.w_4()[gate_index]);
        info("w_1_shift == ", block.w_l()[gate_index]);
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about poseidon2s gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_poseidon2s_gate_info(size_t gate_index, auto& block)
{
    auto internal_selector = block.q_poseidon2_internal()[gate_index];
    auto external_selector = block.q_poseidon2_external()[gate_index];
    if (!internal_selector.is_zero() || !external_selector.is_zero()) {
        info("q_poseidon2_internal == ", internal_selector);
        info("q_poseidon2_external == ", external_selector);
        info("w_1 == ", block.w_l()[gate_index]);
        info("w_2 == ", block.w_r()[gate_index]);
        info("w_3 == ", block.w_o()[gate_index]);
        info("w_4 == ", block.w_4()[gate_index]);
        info("w_1_shift == ", block.w_l()[gate_index + 1]);
        info("w_2_shift == ", block.w_r()[gate_index + 1]);
        info("w_3_shift == ", block.w_o()[gate_index + 1]);
        info("w_4_shift == ", block.w_4()[gate_index + 1]);
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about non natife field gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_nnf_gate_info(size_t gate_idx, auto& block)
{
    auto q_nnf = block.q_nnf()[gate_idx];
    if (!q_nnf.is_zero()) {
        info("q_nnf == ", q_nnf);
        auto q_2 = block.q_2()[gate_idx];
        auto q_3 = block.q_3()[gate_idx];
        auto q_4 = block.q_4()[gate_idx];
        auto q_m = block.q_m()[gate_idx];
        if (q_3 == FF::one() && q_4 == FF::one()) {
            info("w_1_shift == ", block.w_l()[gate_idx + 1]);
            info("w_2_shift == ", block.w_r()[gate_idx + 1]);

        } else if (q_3 == FF::one() && q_m == FF::one()) {
            info("w_1_shift == ", block.w_l()[gate_idx + 1]);
            info("w_2_shift == ", block.w_r()[gate_idx + 1]);
            info("w_3_shift == ", block.w_o()[gate_idx + 1]);
            info("w_4_shift == ", block.w_4()[gate_idx + 1]);
        } else if (q_2 == FF::one() && (q_3 == FF::one() || q_4 == FF::one() || q_m == FF::one())) {
            info("w_1_shift == ", block.w_l()[gate_idx + 1]);
            info("w_2_shift == ", block.w_r()[gate_idx + 1]);
            if (q_4 == FF::one() || q_m == FF::one()) {
                info("w_3_shift == ", block.w_o()[gate_idx + 1]);
                info("w_4_shift == ", block.w_4()[gate_idx + 1]);
            }
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about memory gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_memory_gate_info(size_t gate_index, auto& block)
{
    auto q_memory = block.q_memory()[gate_index];
    if (!q_memory.is_zero()) {
        info("q_memory == ", q_memory);
        auto q_1 = block.q_1()[gate_index];
        auto q_2 = block.q_2()[gate_index];
        auto q_3 = block.q_3()[gate_index];
        auto q_4 = block.q_4()[gate_index];
        if (q_1 == FF::one() && q_4 == FF::one()) {
            info("q_1 == ", q_1);
            info("q_4 == ", q_4);
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
            info("w_2_shift == ", block.w_r()[gate_index + 1]);
        } else if (q_1 == FF::one() && q_2 == FF::one()) {
            info("q_1 == ", q_1);
            info("q_2 == ", q_2);
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
            info("w_4_shift == ", block.w_4()[gate_index + 1]);
        } else if (!q_3.is_zero()) {
            info("q_3 == ", q_3);
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
            info("w_2_shift == ", block.w_r()[gate_index + 1]);
            info("w_3_shift == ", block.w_o()[gate_index + 1]);
            info("w_4_shift == ", block.w_4()[gate_index + 1]);
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about gates where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param real_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_variable_info(const uint32_t real_idx)
{
    using BlockType = std::conditional_t<IsMegaBuilder<CircuitBuilder>, bb::MegaTraceBlock, bb::UltraTraceBlock>;
    for (const auto& [key, gates] : variable_gates) {
        if (key.first == real_idx) {
            for (size_t i = 0; i < gates.size(); i++) {
                size_t gate_index = gates[i];
                // key.second is a pointer to the block
                auto& block = *const_cast<BlockType*>(static_cast<const BlockType*>(key.second));
                info("---- printing variables in this gate");
                info("w_l == ",
                     block.w_l()[gate_index],
                     " w_r == ",
                     block.w_r()[gate_index],
                     " w_o == ",
                     block.w_o()[gate_index],
                     " w_4 == ",
                     block.w_4()[gate_index]);
                info("---- printing gate info where variable with index ", key.first, " was found ----");
                print_arithmetic_gate_info(gate_index, block);
                print_elliptic_gate_info(gate_index, block);
                print_plookup_gate_info(gate_index, block);
                print_poseidon2s_gate_info(gate_index, block);
                print_delta_range_gate_info(gate_index, block);
                print_nnf_gate_info(gate_index, block);
                print_memory_gate_info(gate_index, block);
                if constexpr (IsMegaBuilder<CircuitBuilder>) {
                    auto q_databus = block.q_busread()[gate_index];
                    if (!q_databus.is_zero()) {
                        info("q_databus == ", q_databus);
                    }
                }
                info("---- finished printing ----");
            }
        }
    }
}

/**
 * @brief this functions was made for more convenient testing process
 * @tparam FF
 * @tparam CircuitBuilder
 * @return std::pair<std::vector<ConnectedComponent>, std::unordered_set<uint32_t>>
 * @details it's important to mention that if you want to use this function and get all
 * cc, you have to change flag filter_cc IN tests, because by default it's true
 */

template <typename FF, typename CircuitBuilder>
std::pair<std::vector<ConnectedComponent>, std::unordered_set<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    analyze_circuit(bool filter_cc)
{
    auto variables_in_one_gate = get_variables_in_one_gate();
    find_connected_components();
    if (filter_cc) {
        std::vector<ConnectedComponent> main_connected_components;
        main_connected_components.reserve(connected_components.size());
        for (auto& cc : connected_components) {
            if (!cc.is_range_list_cc && !cc.is_finalize_cc && !cc.is_process_rom_cc) {
                main_connected_components.emplace_back(cc);
            }
        }
        return std::make_pair(std::move(main_connected_components), std::move(variables_in_one_gate));
    }
    return std::make_pair(connected_components, std::move(variables_in_one_gate));
}

template class StaticAnalyzer_<bb::fr, bb::UltraCircuitBuilder>;
template class StaticAnalyzer_<bb::fr, bb::MegaCircuitBuilder>;

} // namespace cdg
