#include "./graph.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <algorithm>
#include <array>
#include <chrono>
#include <stack>

using namespace bb::plookup;
using namespace bb;

using Clock = std::chrono::high_resolution_clock;
using time_point = std::chrono::time_point<Clock>;
namespace cdg {

/**
 * @brief this method finds index of the block in circuit builder by comparing pointers to blocks
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the blocks
 * @param block block to find
 * @return size_t index of the found block
 */
template <typename FF> size_t Graph_<FF>::find_block_index(UltraCircuitBuilder& ultra_builder, const UltraBlock& block)
{
    auto blocks_data = ultra_builder.blocks.get();
    size_t index = 0;
    for (size_t i = 0; i < blocks_data.size(); i++) {
        if ((void*)(&blocks_data[i]) == (void*)(&block)) {
            index = i;
            break;
        }
    }
    return index;
}

/**
 * @brief this method processes variables from a gate by removing duplicates and updating tracking structures
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the variables
 * @param gate_variables vector of variables to process
 * @param gate_index index of the current gate
 * @param block_idx index of the current block
 * @details The method performs several operations:
 *          1) Removes duplicate variables from the input vector
 *          2) Converts each variable to its real index using to_real
 *          3) Creates key-value pairs of (variable_index, block_index) for tracking
 *          4) Updates variable_gates map with gate indices for each variable
 *          5) Increments the gate count for each processed variable
 */
template <typename FF>
inline void Graph_<FF>::process_gate_variables([[maybe_unused]] UltraCircuitBuilder& ultra_circuit_builder,
                                               std::vector<uint32_t>& gate_variables,
                                               size_t gate_index,
                                               size_t block_idx)
{
    auto unique_variables = std::unique(gate_variables.begin(), gate_variables.end());
    gate_variables.erase(unique_variables, gate_variables.end());
    if (gate_variables.empty()) {
        return;
    }
    for (auto& var_idx : gate_variables) {
        KeyPair key = std::make_pair(var_idx, block_idx);
        variable_gates[key].emplace_back(gate_index);
    }
    for (const auto& variable_index : gate_variables) {
        variables_gate_counts[variable_index] += 1;
    }
}

/**
 * @brief this method creates connected components from arithmetic gates
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param blk block containing the gates
 * @return std::vector<std::vector<uint32_t>> vector of connected components from the gate and minigate
 * @details Processes both regular arithmetic gates and minigates, handling fixed witness gates
 *          and different arithmetic operations based on selector values
 */
template <typename FF>
inline std::vector<std::vector<uint32_t>> Graph_<FF>::get_arithmetic_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index, size_t block_idx, UltraBlock& blk)
{
    auto q_arith = blk.q_arith()[index];
    std::vector<uint32_t> gate_variables;
    std::vector<uint32_t> minigate_variables;
    std::vector<std::vector<uint32_t>> all_gates_variables;
    if (q_arith.is_zero()) {
        return {};
    }
    auto q_m = blk.q_m()[index];
    auto q_1 = blk.q_1()[index];
    auto q_2 = blk.q_2()[index];
    auto q_3 = blk.q_3()[index];
    auto q_4 = blk.q_4()[index];

    uint32_t left_idx = blk.w_l()[index];
    uint32_t right_idx = blk.w_r()[index];
    uint32_t out_idx = blk.w_o()[index];
    uint32_t fourth_idx = blk.w_4()[index];
    if (q_m.is_zero() && q_1 == 1 && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() && q_arith == FF::one()) {
        // this is fixed_witness gate. So, variable index contains in left wire. So, we have to take only it.
        fixed_variables.insert(this->to_real(ultra_circuit_builder, left_idx));
    } else if (!q_m.is_zero() || q_1 != FF::one() || !q_2.is_zero() || !q_3.is_zero() || !q_4.is_zero()) {
        // gate_variables.reserve(8);
        //  this is not the gate for fix_witness, so we have to process this gate
        if (!q_m.is_zero()) {
            gate_variables.emplace_back(left_idx);
            gate_variables.emplace_back(right_idx);
        } else {
            if (!q_1.is_zero()) {
                gate_variables.emplace_back(left_idx);
            }
            if (!q_2.is_zero()) {
                gate_variables.emplace_back(right_idx);
            }
        }

        if (!q_3.is_zero()) {
            gate_variables.emplace_back(out_idx);
        }
        if (!q_4.is_zero()) {
            gate_variables.emplace_back(fourth_idx);
        }
        if (q_arith == FF(2)) {
            // We have to use w_4_shift from the next gate
            // if and only if the current gate isn't last, cause we can't
            // look into the next gate
            if (index != blk.size() - 1) {
                gate_variables.emplace_back(blk.w_4()[index + 1]);
            }
        }
        if (q_arith == FF(3)) {
            // minigate_variables.reserve(3);
            //  In this gate mini gate is enabled, we have 2 equations:
            //  q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c + 2 * w_4_omega = 0
            //  w_1 + w_4 - w_1_omega + q_m = 0
            minigate_variables.emplace_back(left_idx);
            minigate_variables.emplace_back(fourth_idx);
            if (index != blk.size() - 1) {
                gate_variables.emplace_back(blk.w_4()[index + 1]);
                minigate_variables.emplace_back(blk.w_l()[index + 1]);
            }
        }
    }
    gate_variables = this->to_real(ultra_circuit_builder, gate_variables);
    minigate_variables = this->to_real(ultra_circuit_builder, minigate_variables);
    this->process_gate_variables(ultra_circuit_builder, gate_variables, index, block_idx);
    this->process_gate_variables(ultra_circuit_builder, minigate_variables, index, block_idx);
    all_gates_variables.emplace_back(gate_variables);
    if (!minigate_variables.empty()) {
        all_gates_variables.emplace_back(minigate_variables);
    }

    return all_gates_variables;
}

/**
 * @brief this method creates connected components from elliptic gates
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param blk block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Handles both elliptic curve addition and doubling operations,
 *          collecting variables from current and next gates as needed
 */
template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_elliptic_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index, size_t block_idx, UltraBlock& blk)
{
    std::vector<uint32_t> gate_variables;
    if (!blk.q_elliptic()[index].is_zero()) {
        gate_variables.reserve(6);
        bool is_elliptic_add_gate = !blk.q_1()[index].is_zero() && blk.q_m()[index].is_zero();
        bool is_elliptic_dbl_gate = blk.q_1()[index].is_zero() && blk.q_m()[index] == FF::one();
        auto right_idx = blk.w_r()[index];
        auto out_idx = blk.w_o()[index];
        gate_variables.emplace_back(right_idx);
        gate_variables.emplace_back(out_idx);
        if (index != blk.size() - 1) {
            if (is_elliptic_add_gate) {
                // if this gate is ecc_add_gate, we have to get indices x2, x3, y3, y2 from the next gate
                gate_variables.emplace_back(blk.w_l()[index + 1]);
                gate_variables.emplace_back(blk.w_r()[index + 1]);
                gate_variables.emplace_back(blk.w_o()[index + 1]);
                gate_variables.emplace_back(blk.w_4()[index + 1]);
            }
            if (is_elliptic_dbl_gate) {
                // if this gate is ecc_dbl_gate, we have to indices x3, y3 from right and output wires
                gate_variables.emplace_back(blk.w_r()[index + 1]);
                gate_variables.emplace_back(blk.w_o()[index + 1]);
            }
        }
        gate_variables = this->to_real(ultra_circuit_builder, gate_variables);
        this->process_gate_variables(ultra_circuit_builder, gate_variables, index, block_idx);
    }
    return gate_variables;
}

/**
 * @brief this method creates connected components from sorted constraints
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Processes delta range constraints by collecting all wire indices
 *          from the current gate
 */
template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_sort_constraint_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index, size_t blk_idx, UltraBlock& block)
{
    std::vector<uint32_t> gate_variables = {};
    if (!block.q_delta_range()[index].is_zero()) {
        gate_variables.reserve(4);
        gate_variables.emplace_back(block.w_l()[index]);
        gate_variables.emplace_back(block.w_r()[index]);
        gate_variables.emplace_back(block.w_o()[index]);
        gate_variables.emplace_back(block.w_4()[index]);
    }
    gate_variables = this->to_real(ultra_circuit_builder, gate_variables);
    this->process_gate_variables(ultra_circuit_builder, gate_variables, index, blk_idx);
    return gate_variables;
}

/**
 * @brief this method creates connected components from plookup gates
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Processes plookup gates by collecting variables based on selector values,
 *          including variables from the next gate when necessary
 */
template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_plookup_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index, size_t blk_idx, UltraBlock& block)
{
    std::vector<uint32_t> gate_variables;
    auto q_lookup_type = block.q_lookup_type()[index];
    if (!q_lookup_type.is_zero()) {
        gate_variables.reserve(6);
        auto q_2 = block.q_2()[index];
        auto q_m = block.q_m()[index];
        auto q_c = block.q_c()[index];
        gate_variables.emplace_back(block.w_l()[index]);
        gate_variables.emplace_back(block.w_r()[index]);
        gate_variables.emplace_back(block.w_o()[index]);
        if (index < block.size() - 1) {
            if (!q_2.is_zero()) {
                gate_variables.emplace_back(block.w_l()[index + 1]);
            }
            if (!q_m.is_zero()) {
                gate_variables.emplace_back(block.w_r()[index + 1]);
            }
            if (!q_c.is_zero()) {
                gate_variables.emplace_back(block.w_o()[index + 1]);
            }
        }
        gate_variables = this->to_real(ultra_circuit_builder, gate_variables);
        this->process_gate_variables(ultra_circuit_builder, gate_variables, index, blk_idx);
    }
    return gate_variables;
}

/**
 * @brief this method creates connected components from poseidon2 gates
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param blk_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 */
template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_poseido2s_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index, size_t blk_idx, UltraBlock& block)
{
    std::vector<uint32_t> gate_variables;
    auto internal_selector = block.q_poseidon2_internal()[index];
    auto external_selector = block.q_poseidon2_external()[index];
    if (!internal_selector.is_zero() || !external_selector.is_zero()) {
        gate_variables.reserve(8);
        gate_variables.emplace_back(block.w_l()[index]);
        gate_variables.emplace_back(block.w_r()[index]);
        gate_variables.emplace_back(block.w_o()[index]);
        gate_variables.emplace_back(block.w_4()[index]);
        if (index != block.size() - 1) {
            gate_variables.emplace_back(block.w_l()[index + 1]);
            gate_variables.emplace_back(block.w_r()[index + 1]);
            gate_variables.emplace_back(block.w_o()[index + 1]);
            gate_variables.emplace_back(block.w_4()[index + 1]);
        }
        gate_variables = this->to_real(ultra_circuit_builder, gate_variables);
        this->process_gate_variables(ultra_circuit_builder, gate_variables, index, blk_idx);
    }
    return gate_variables;
}

/**
 * @brief this method creates connected components from auxiliary gates, including bigfield operations,
 *        RAM and ROM consistency checks
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param blk_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 */
template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_auxiliary_gate_connected_component(bb::UltraCircuitBuilder& ultra_builder,
                                                                                size_t index,
                                                                                size_t blk_idx,
                                                                                UltraBlock& block)
{
    std::vector<uint32_t> gate_variables;
    if (!block.q_aux()[index].is_zero()) {
        gate_variables.reserve(8);
        auto q_1 = block.q_1()[index];
        auto q_2 = block.q_2()[index];
        auto q_3 = block.q_3()[index];
        auto q_4 = block.q_4()[index];
        auto q_m = block.q_m()[index];
        auto q_arith = block.q_arith()[index];
        [[maybe_unused]] auto q_c = block.q_c()[index];

        auto w_l = block.w_l()[index];
        auto w_r = block.w_r()[index];
        auto w_o = block.w_o()[index];
        auto w_4 = block.w_4()[index];
        if (q_3 == FF::one() && q_4 == FF::one()) {
            // bigfield limb accumulation 1
            ASSERT(q_arith.is_zero());
            if (index < block.size() - 1) {
                gate_variables.insert(gate_variables.end(),
                                      { w_l, w_r, w_o, w_4, block.w_l()[index + 1], block.w_r()[index + 1] }); // 6
            }
        } else if (q_3 == FF::one() && q_m == FF::one()) {
            ASSERT(q_arith.is_zero());
            // bigfield limb accumulation 2
            if (index < block.size() - 1) {
                gate_variables.insert(gate_variables.end(),
                                      { w_o,
                                        w_4,
                                        block.w_l()[index + 1],
                                        block.w_r()[index + 1],
                                        block.w_o()[index + 1],
                                        block.w_4()[index + 1] });
            }
        } else if (q_2 == FF::one() && (q_3 == FF::one() || q_4 == FF::one() || q_m == FF::one())) {
            ASSERT(q_arith.is_zero());
            // bigfield product cases
            if (index < block.size() - 1) {
                std::vector<uint32_t> limb_subproduct_vars = {
                    w_l, w_r, block.w_l()[index + 1], block.w_r()[index + 1]
                };
                if (q_3 == FF::one()) {
                    // bigfield product 1
                    ASSERT(q_4.is_zero() && q_m.is_zero());
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                    gate_variables.insert(gate_variables.end(), { w_o, w_4 });
                }
                if (q_4 == FF::one()) {
                    // bigfield product 2
                    ASSERT(q_3.is_zero() && q_m.is_zero());
                    std::vector<uint32_t> non_native_field_gate_2 = { w_l, w_4, w_r, w_o, block.w_o()[index + 1] };
                    gate_variables.insert(
                        gate_variables.end(), non_native_field_gate_2.begin(), non_native_field_gate_2.end());
                    gate_variables.emplace_back(block.w_4()[index + 1]);
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                }
                if (q_m == FF::one()) {
                    // bigfield product 3
                    ASSERT(q_4.is_zero() && q_3.is_zero());
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                    gate_variables.insert(gate_variables.end(),
                                          { w_4, block.w_o()[index + 1], block.w_4()[index + 1] });
                }
            }
        } else if (q_1 == FF::one() && q_4 == FF::one()) {
            ASSERT(q_arith.is_zero());
            // ram timestamp check
            if (index < block.size() - 1) {
                gate_variables.insert(gate_variables.end(),
                                      { block.w_r()[index + 1],
                                        block.w_r()[index],
                                        block.w_l()[index],
                                        block.w_l()[index + 1],
                                        block.w_o()[index] });
            }
        } else if (q_1 == FF::one() && q_2 == FF::one()) {
            ASSERT(q_arith.is_zero());
            // rom constitency check
            if (index < block.size() - 1) {
                gate_variables.insert(
                    gate_variables.end(),
                    { block.w_l()[index], block.w_l()[index + 1], block.w_4()[index], block.w_4()[index + 1] });
            }
        } else {
            // ram constitency check
            if (!q_arith.is_zero()) {
                if (index < block.size() - 1) {
                    gate_variables.insert(gate_variables.end(),
                                          { block.w_o()[index],
                                            block.w_4()[index],
                                            block.w_l()[index + 1],
                                            block.w_r()[index + 1],
                                            block.w_o()[index + 1],
                                            block.w_4()[index + 1] });
                }
            }
        }
    }
    gate_variables = this->to_real(ultra_builder, gate_variables);
    this->process_gate_variables(ultra_builder, gate_variables, index, blk_idx);
    return gate_variables;
}

/**
 * @brief this method gets the ROM table connected component by processing ROM transcript records
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the gates
 * @param rom_array ROM transcript containing records with witness indices and gate information
 * @return std::vector<uint32_t> vector of connected variables from ROM table gates
 */
template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_rom_table_connected_component(
    bb::UltraCircuitBuilder& ultra_builder, const UltraCircuitBuilder::RomTranscript& rom_array)
{
    size_t block_index = find_block_index(ultra_builder, ultra_builder.blocks.aux);
    ASSERT(block_index == 5);

    // Every RomTranscript data structure has 2 main components that are interested for static analyzer:
    // 1) records contains values that were put in the gate, we can use them to create connections between variables
    // 2) states contains values witness indexes that we can find in the ROM record in the RomTrascript, so we can
    // ignore state of the ROM transcript, because we still can connect all variables using variables from records.
    std::vector<uint32_t> rom_table_variables;

    for (const auto& record : rom_array.records) {
        std::vector<uint32_t> gate_variables;
        size_t gate_index = record.gate_index;

        auto q_1 = ultra_builder.blocks.aux.q_1()[gate_index];
        auto q_2 = ultra_builder.blocks.aux.q_2()[gate_index];
        auto q_3 = ultra_builder.blocks.aux.q_3()[gate_index];
        auto q_4 = ultra_builder.blocks.aux.q_4()[gate_index];
        auto q_m = ultra_builder.blocks.aux.q_m()[gate_index];
        auto q_arith = ultra_builder.blocks.aux.q_arith()[gate_index];
        auto q_c = ultra_builder.blocks.aux.q_c()[gate_index];

        auto index_witness = record.index_witness;
        auto vc1_witness = record.value_column1_witness; // state[0] from RomTranscript
        auto vc2_witness = record.value_column2_witness; // state[1] from RomTranscript
        auto record_witness = record.record_witness;

        if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() && q_c.is_zero() &&
            q_arith.is_zero()) {
            // By default ROM read gate uses variables (w_1, w_2, w_3, w_4) = (index_witness, vc1_witness, vc2_witness,
            // record_witness) So we can update all of them
            gate_variables.emplace_back(index_witness);
            if (vc1_witness != ultra_builder.zero_idx) {
                gate_variables.emplace_back(vc1_witness);
            }
            if (vc2_witness != ultra_builder.zero_idx) {
                gate_variables.emplace_back(vc2_witness);
            }
            gate_variables.emplace_back(record_witness);
        }
        gate_variables = this->to_real(ultra_builder, gate_variables);
        this->process_gate_variables(ultra_builder, gate_variables, gate_index, block_index);
        // after process_gate_variables function gate_variables constists of real variables indexes, so we can add all
        // this variables in the final vector to connect all of them
        if (!gate_variables.empty()) {
            rom_table_variables.insert(rom_table_variables.end(), gate_variables.begin(), gate_variables.end());
        }
    }
    return rom_table_variables;
}

/**
 * @brief this method gets the RAM table connected component by processing RAM transcript records
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the gates
 * @param ram_array RAM transcript containing records with witness indices and gate information
 * @return std::vector<uint32_t> vector of connected variables from RAM table gates
 */
template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_ram_table_connected_component(
    bb::UltraCircuitBuilder& ultra_builder, const UltraCircuitBuilder::RamTranscript& ram_array)
{
    size_t block_index = find_block_index(ultra_builder, ultra_builder.blocks.aux);
    ASSERT(block_index == 5);
    std::vector<uint32_t> ram_table_variables;
    for (const auto& record : ram_array.records) {
        std::vector<uint32_t> gate_variables;
        size_t gate_index = record.gate_index;

        auto q_1 = ultra_builder.blocks.aux.q_1()[gate_index];
        auto q_2 = ultra_builder.blocks.aux.q_2()[gate_index];
        auto q_3 = ultra_builder.blocks.aux.q_3()[gate_index];
        auto q_4 = ultra_builder.blocks.aux.q_4()[gate_index];
        auto q_m = ultra_builder.blocks.aux.q_m()[gate_index];
        auto q_arith = ultra_builder.blocks.aux.q_arith()[gate_index];
        auto q_c = ultra_builder.blocks.aux.q_c()[gate_index];

        auto index_witness = record.index_witness;
        auto timestamp_witness = record.timestamp_witness;
        auto value_witness = record.value_witness;
        auto record_witness = record.record_witness;

        if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
            q_arith.is_zero() && (q_c.is_zero() || q_c == FF::one())) {
            // By default RAM read/write gate uses variables (w_1, w_2, w_3, w_4) = (index_witness, timestamp_witness,
            // value_witness, record_witness) So we can update all of them
            gate_variables.emplace_back(index_witness);
            if (timestamp_witness != ultra_builder.zero_idx) {
                gate_variables.emplace_back(timestamp_witness);
            }
            if (value_witness != ultra_builder.zero_idx) {
                gate_variables.emplace_back(value_witness);
            }
            gate_variables.emplace_back(record_witness);
        }
        gate_variables = this->to_real(ultra_builder, gate_variables);
        this->process_gate_variables(ultra_builder, gate_variables, gate_index, block_index);
        // after process_gate_variables function gate_variables constists of real variables indexes, so we can add all
        // these variables in the final vector to connect all of them
        ram_table_variables.insert(ram_table_variables.end(), gate_variables.begin(), gate_variables.end());
    }
    return ram_table_variables;
}

/**
 * @brief Construct a new Graph from Ultra Circuit Builder
 * @tparam FF field type used in the circuit
 * @param ultra_circuit_constructor circuit builder containing all gates and variables
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
 *             - Auxiliary gates
 *             - Delta range gates
 *          3) Creating connections between variables that appear in the same gate
 *          4) Special handling for sorted constraints in delta range blocks
 */
template <typename FF> Graph_<FF>::Graph_(bb::UltraCircuitBuilder& ultra_circuit_constructor, bool graph)
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
    auto block_data = ultra_circuit_constructor.blocks.get();
    for (size_t blk_idx = 1; blk_idx < block_data.size() - 1; blk_idx++) {
        if (block_data[blk_idx].size() == 0) {
            continue;
        }
        std::vector<uint32_t> sorted_variables;
        [[maybe_unused]] time_point start;
        [[maybe_unused]] time_point end;
        // start = Clock::now();
        for (size_t gate_idx = 0; gate_idx < block_data[blk_idx].size(); gate_idx++) {
            auto arithmetic_gates_variables = get_arithmetic_gate_connected_component(
                ultra_circuit_constructor, gate_idx, blk_idx, block_data[blk_idx]);
            if (!arithmetic_gates_variables.empty() && graph) {
                for (const auto& gate_variables : arithmetic_gates_variables) {
                    connect_all_variables_in_vector(ultra_circuit_constructor, gate_variables);
                }
            }
            auto elliptic_gate_variables = get_elliptic_gate_connected_component(
                ultra_circuit_constructor, gate_idx, blk_idx, block_data[blk_idx]);
            if (graph) {
                connect_all_variables_in_vector(ultra_circuit_constructor, elliptic_gate_variables);
            }
            auto lookup_gate_variables =
                get_plookup_gate_connected_component(ultra_circuit_constructor, gate_idx, blk_idx, block_data[blk_idx]);
            if (graph) {
                connect_all_variables_in_vector(ultra_circuit_constructor, lookup_gate_variables);
            }
            auto poseidon2_gate_variables = get_poseido2s_gate_connected_component(
                ultra_circuit_constructor, gate_idx, blk_idx, block_data[blk_idx]);
            if (graph) {
                connect_all_variables_in_vector(ultra_circuit_constructor, poseidon2_gate_variables);
            }
            auto aux_gate_variables = get_auxiliary_gate_connected_component(
                ultra_circuit_constructor, gate_idx, blk_idx, block_data[blk_idx]);
            if (graph) {
                connect_all_variables_in_vector(ultra_circuit_constructor, aux_gate_variables);
            }
            if (arithmetic_gates_variables.empty() && elliptic_gate_variables.empty() &&
                lookup_gate_variables.empty() && poseidon2_gate_variables.empty() && aux_gate_variables.empty()) {
                // if all vectors are empty it means that current block is delta range, and it needs another
                // processing method
                auto delta_range_gate_variables = get_sort_constraint_connected_component(
                    ultra_circuit_constructor, gate_idx, blk_idx, block_data[blk_idx]);
                if (delta_range_gate_variables.empty()) {
                    if (graph) {
                        connect_all_variables_in_vector(ultra_circuit_constructor, sorted_variables);
                    }
                    sorted_variables.clear();
                } else {
                    sorted_variables.insert(
                        sorted_variables.end(), delta_range_gate_variables.begin(), delta_range_gate_variables.end());
                }
            }
        }
        // end = Clock::now();
        // info("time for block with index", blk_idx, " == ", (end - start).count());
    }

    const auto& rom_arrays = ultra_circuit_constructor.rom_arrays;
    if (!rom_arrays.empty()) {
        for (const auto& rom_array : rom_arrays) {
            std::vector<uint32_t> variable_indices =
                this->get_rom_table_connected_component(ultra_circuit_constructor, rom_array);
            if (graph) {
                this->connect_all_variables_in_vector(ultra_circuit_constructor, variable_indices);
            }
        }
    }

    const auto& ram_arrays = ultra_circuit_constructor.ram_arrays;
    if (!ram_arrays.empty()) {
        for (const auto& ram_array : ram_arrays) {
            std::vector<uint32_t> variable_indices =
                this->get_ram_table_connected_component(ultra_circuit_constructor, ram_array);
            if (graph) {
                this->connect_all_variables_in_vector(ultra_circuit_constructor, variable_indices);
            }
        }
    }
}

/**
 * @brief this method checks whether the variable with given index is not constant
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variable_index
 * @return true
 * @return false
 */

template <typename FF>
bool Graph_<FF>::check_is_not_constant_variable(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                const uint32_t& variable_index)
{
    bool is_not_constant = true;
    const auto& constant_variable_indices = ultra_circuit_builder.constant_variable_indices;
    for (const auto& pair : constant_variable_indices) {
        if (pair.second == ultra_circuit_builder.real_variable_index[variable_index]) {
            is_not_constant = false;
            break;
        }
    }
    return is_not_constant;
}

/**
 * @brief this method connects 2 variables if they are in one gate and
 * 1) have different indices,
 * 2) not constant variables,
 * 3) their indices != 0
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variables_vector
 * @param is_sorted_variables
 */

template <typename FF>
void Graph_<FF>::connect_all_variables_in_vector(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                 const std::vector<uint32_t>& variables_vector)
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
                     return variable_index != ultra_circuit_builder.zero_idx &&
                            this->check_is_not_constant_variable(ultra_circuit_builder, variable_index);
                 });
    // Remove duplicates
    auto unique_pointer = std::unique(filtered_variables_vector.begin(), filtered_variables_vector.end());
    filtered_variables_vector.erase(unique_pointer, filtered_variables_vector.end());
    if (filtered_variables_vector.size() < 2) {
        return;
    }
    for (size_t i = 0; i < filtered_variables_vector.size() - 1; i++) {
        this->add_new_edge(filtered_variables_vector[i], filtered_variables_vector[i + 1]);
    }
}

/**
 * @brief this method creates an edge between two variables in graph. All needed checks in a function above
 * @tparam FF
 * @param first_variable_index
 * @param second_variable_index
 */

template <typename FF>
void Graph_<FF>::add_new_edge(const uint32_t& first_variable_index, const uint32_t& second_variable_index)
{
    variable_adjacency_lists[first_variable_index].emplace_back(second_variable_index);
    variable_adjacency_lists[second_variable_index].emplace_back(first_variable_index);
    variables_degree[first_variable_index] += 1;
    variables_degree[second_variable_index] += 1;
}

/**
 * @brief this method implements depth-first search algorithm for undirected graphs
 * @tparam FF
 * @param variable_index
 * @param is_used
 * @param connected_component
 */

template <typename FF>
void Graph_<FF>::depth_first_search(const uint32_t& variable_index,
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
 * @brief this methond finds all connected components in the graph described by adjacency lists
 * @tparam FF
 * @return std::vector<std::vector<uint32_t>> list of connected components where each component is a vector of variable
 * indices
 */

template <typename FF> std::vector<std::vector<uint32_t>> Graph_<FF>::find_connected_components()
{
    std::unordered_set<uint32_t> is_used;
    std::vector<std::vector<uint32_t>> connected_components;
    for (const auto& pair : variable_adjacency_lists) {
        if (pair.first != 0 && variables_degree[pair.first] > 0) {
            if (!is_used.contains(pair.first)) {
                std::vector<uint32_t> connected_component;
                this->depth_first_search(pair.first, is_used, connected_component);
                std::sort(connected_component.begin(), connected_component.end());
                connected_components.emplace_back(connected_component);
            }
        }
    }
    return connected_components;
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
 * @param ultra_circuit_constructor
 * @param variables_in_one_gate
 * @param index
 * @return size_t
 */

template <typename FF>
inline size_t Graph_<FF>::process_current_decompose_chain(bb::UltraCircuitBuilder& ultra_circuit_constructor,
                                                          std::unordered_set<uint32_t>& variables_in_one_gate,
                                                          size_t index)
{
    auto& arithmetic_block = ultra_circuit_constructor.blocks.arithmetic;
    auto zero_idx = ultra_circuit_constructor.zero_idx;
    size_t current_index = index;
    std::vector<uint32_t> accumulators_indices;
    while (true) {
        // we have to remove left, right and output wires of the current gate, cause they'are new_limbs, and they are
        // useless for the analyzer
        auto fourth_idx = arithmetic_block.w_4()[current_index];
        accumulators_indices.emplace_back(this->to_real(ultra_circuit_constructor, fourth_idx));
        auto left_idx = arithmetic_block.w_l()[current_index];
        if (left_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(ultra_circuit_constructor, left_idx));
        }
        auto right_idx = arithmetic_block.w_r()[current_index];
        if (right_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(ultra_circuit_constructor, right_idx));
        }
        auto out_idx = arithmetic_block.w_o()[current_index];
        if (out_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(ultra_circuit_constructor, out_idx));
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

/**
 * @brief this method removes unnecessary variables from decompose chains
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variables_in_one_gate
 * @param decompose_variables
 */

template <typename FF>
inline void Graph_<FF>::remove_unnecessary_decompose_variables(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                               std::unordered_set<uint32_t>& variables_in_one_gate,
                                                               const std::unordered_set<uint32_t>& decompose_variables)
{
    auto is_power_two = [&](const uint256_t& number) { return number > 0 && ((number & (number - 1)) == 0); };
    auto find_position = [&](uint32_t variable_index) {
        return decompose_variables.contains(this->to_real(ultra_circuit_builder, variable_index));
    };
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
                    i = this->process_current_decompose_chain(ultra_circuit_builder, variables_in_one_gate, i);
                }
            }
        }
    }
}

/**
 * @brief this method removes variables from range constraints that are not security critical
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the range lists
 * @details Right now static analyzer removes two types of variables:
 *          1) Variables from delta_range_constraints created by finalize_circuit()
 *          2) Variables from range_constraints created by range_constraint_into_two_limbs
 */
template <typename FF>
void Graph_<FF>::remove_unnecessary_range_constrains_variables(bb::UltraCircuitBuilder& ultra_builder)
{
    std::map<uint64_t, UltraCircuitBuilder::RangeList> range_lists = ultra_builder.range_lists;
    std::unordered_set<uint32_t> range_lists_tau_tags;
    std::unordered_set<uint32_t> range_lists_range_tags;
    std::vector<uint32_t> real_variable_tags = ultra_builder.real_variable_tags;
    for (const auto& pair : range_lists) {
        UltraCircuitBuilder::RangeList list = pair.second;
        range_lists_tau_tags.insert(list.tau_tag);
        range_lists_range_tags.insert(list.range_tag);
    }
    for (uint32_t real_index = 0; real_index < real_variable_tags.size(); real_index++) {
        if (variables_in_one_gate.contains(real_index)) {
            // this if helps us to remove variables from delta_range_constraints when finalize_circuit() function was
            // called
            if (range_lists_tau_tags.contains(real_variable_tags[real_index])) {
                variables_in_one_gate.erase(real_index);
            }
            // this if helps us to remove variables from range_constraints when range_constraint_into_two_limbs function
            // was called
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
 * @param variables_in_one_gate
 * @param ultra_circuit_builder
 * @param table_id
 * @param gate_index
 */
template <typename FF>
inline void Graph_<FF>::remove_unnecessary_aes_plookup_variables(std::unordered_set<uint32_t>& variables_in_one_gate,
                                                                 UltraCircuitBuilder& ultra_circuit_builder,
                                                                 BasicTableId& table_id,
                                                                 size_t gate_index)
{

    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    std::unordered_set<BasicTableId> aes_plookup_tables{ BasicTableId::AES_SBOX_MAP,
                                                         BasicTableId::AES_SPARSE_MAP,
                                                         BasicTableId::AES_SPARSE_NORMALIZE };
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    if (aes_plookup_tables.contains(table_id)) {
        uint32_t real_out_idx = this->to_real(ultra_circuit_builder, lookup_block.w_o()[gate_index]);
        uint32_t real_right_idx = this->to_real(ultra_circuit_builder, lookup_block.w_r()[gate_index]);
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
 * @param variables_in_one_gate
 * @param ultra_circuit_builder
 * @param table_id
 * @param gate_index
 */

template <typename FF>
inline void Graph_<FF>::remove_unnecessary_sha256_plookup_variables(std::unordered_set<uint32_t>& variables_in_one_gate,
                                                                    UltraCircuitBuilder& ultra_circuit_builder,
                                                                    BasicTableId& table_id,
                                                                    size_t gate_index)
{

    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    std::unordered_set<BasicTableId> sha256_plookup_tables{ BasicTableId::SHA256_WITNESS_SLICE_3,
                                                            BasicTableId::SHA256_WITNESS_SLICE_7_ROTATE_4,
                                                            BasicTableId::SHA256_WITNESS_SLICE_8_ROTATE_7,
                                                            BasicTableId::SHA256_WITNESS_SLICE_14_ROTATE_1,
                                                            BasicTableId::SHA256_BASE16,
                                                            BasicTableId::SHA256_BASE16_ROTATE2,
                                                            BasicTableId::SHA256_BASE16_ROTATE6,
                                                            BasicTableId::SHA256_BASE16_ROTATE7,
                                                            BasicTableId::SHA256_BASE16_ROTATE8,
                                                            BasicTableId::SHA256_BASE28,
                                                            BasicTableId::SHA256_BASE28_ROTATE3,
                                                            BasicTableId::SHA256_BASE28_ROTATE6 };
    if (sha256_plookup_tables.contains(table_id)) {
        uint32_t real_right_idx = this->to_real(ultra_circuit_builder, lookup_block.w_r()[gate_index]);
        uint32_t real_out_idx = this->to_real(ultra_circuit_builder, lookup_block.w_o()[gate_index]);
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
 * @param ultra_circuit_builder
 * @param variables_in_one_gate
 * @param gate_index
 */

template <typename FF>
inline void Graph_<FF>::process_current_plookup_gate(bb::UltraCircuitBuilder& ultra_circuit_builder, size_t gate_index)
{
    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    auto& lookup_tables = ultra_circuit_builder.lookup_tables;
    auto table_index = static_cast<size_t>(lookup_block.q_3()[gate_index]);
    for (const auto& table : lookup_tables) {
        if (table.table_index == table_index) {
            std::unordered_set<bb::fr> column_1(table.column_1.begin(), table.column_1.end());
            std::unordered_set<bb::fr> column_2(table.column_2.begin(), table.column_2.end());
            std::unordered_set<bb::fr> column_3(table.column_3.begin(), table.column_3.end());
            bb::plookup::BasicTableId table_id = table.id;
            // false cases for AES
            this->remove_unnecessary_aes_plookup_variables(
                variables_in_one_gate, ultra_circuit_builder, table_id, gate_index);
            // false cases for sha256
            this->remove_unnecessary_sha256_plookup_variables(
                variables_in_one_gate, ultra_circuit_builder, table_id, gate_index);
            // if the amount of unique elements from columns of plookup tables = 1, it means that
            // variable from this column aren't used and we can remove it.
            if (column_1.size() == 1) {
                uint32_t left_idx = lookup_block.w_l()[gate_index];
                uint32_t real_left_idx = this->to_real(ultra_circuit_builder, left_idx);
                bool find_left = find_position(real_left_idx);
                if (find_left) {
                    variables_in_one_gate.erase(real_left_idx);
                }
            }
            if (column_2.size() == 1) {
                uint32_t real_right_idx = this->to_real(ultra_circuit_builder, lookup_block.w_r()[gate_index]);
                bool find_right = find_position(real_right_idx);
                if (find_right) {
                    variables_in_one_gate.erase(real_right_idx);
                }
            }
            if (column_3.size() == 1) {
                uint32_t real_out_idx = this->to_real(ultra_circuit_builder, lookup_block.w_o()[gate_index]);
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
 * @param ultra_circuit_builder
 * @param variables_in_one_gate
 */

template <typename FF>
inline void Graph_<FF>::remove_unnecessary_plookup_variables(bb::UltraCircuitBuilder& ultra_circuit_builder)
{
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    if (lookup_block.size() > 0) {
        for (size_t i = 0; i < lookup_block.size(); i++) {
            this->process_current_plookup_gate(ultra_circuit_builder, i);
        }
    }
}

/**
 * @brief this method removes record witness variables from variables in one gate.
 * initially record witness is added in the circuit as ctx->add_variable(0), where ctx -- circuit builder.
 * then aren't used anymore, so we can remove from the static analyzer.
 * @tparam FF
 * @param ultra_builder
 */

template <typename FF> inline void Graph_<FF>::remove_record_witness_variables(bb::UltraCircuitBuilder& ultra_builder)
{
    auto block_data = ultra_builder.blocks.get();
    size_t blk_idx = find_block_index(ultra_builder, ultra_builder.blocks.aux);
    std::vector<uint32_t> to_remove;
    ASSERT(blk_idx == 5);
    for (const auto& var_idx : variables_in_one_gate) {
        KeyPair key = { var_idx, blk_idx };
        if (auto search = variable_gates.find(key); search != variable_gates.end()) {
            std::vector<size_t> gate_indexes = variable_gates[key];
            ASSERT(gate_indexes.size() == 1);
            size_t gate_idx = gate_indexes[0];
            auto q_1 = block_data[blk_idx].q_1()[gate_idx];
            auto q_2 = block_data[blk_idx].q_2()[gate_idx];
            auto q_3 = block_data[blk_idx].q_3()[gate_idx];
            auto q_4 = block_data[blk_idx].q_4()[gate_idx];
            auto q_m = block_data[blk_idx].q_m()[gate_idx];
            auto q_arith = block_data[blk_idx].q_arith()[gate_idx];
            if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
                q_arith.is_zero()) {
                // record witness can be in both ROM and RAM gates, so we can ignore q_c
                // record witness is written as 4th variable in RAM/ROM read/write gate, so we can get 4th wire value
                // and check it with our variable
                if (this->to_real(ultra_builder, block_data[blk_idx].w_4()[gate_idx]) == var_idx) {
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
 * @param ultra_circuit_builder circuit builder containing the variables
 * @return std::unordered_set<uint32_t> set of variable indices
 */

template <typename FF>
std::unordered_set<uint32_t> Graph_<FF>::show_variables_in_one_gate(bb::UltraCircuitBuilder& ultra_circuit_builder)
{
    for (const auto& pair : variables_gate_counts) {
        bool is_not_constant_variable = this->check_is_not_constant_variable(ultra_circuit_builder, pair.first);
        if (pair.second == 1 && pair.first != 0 && is_not_constant_variable) {
            this->variables_in_one_gate.insert(pair.first);
        }
    }
    auto range_lists = ultra_circuit_builder.range_lists;
    std::unordered_set<uint32_t> decompose_varialbes;
    for (auto& pair : range_lists) {
        for (auto& elem : pair.second.variable_indices) {
            bool is_not_constant_variable = this->check_is_not_constant_variable(ultra_circuit_builder, elem);
            if (variables_gate_counts[ultra_circuit_builder.real_variable_index[elem]] == 1 &&
                is_not_constant_variable) {
                decompose_varialbes.insert(ultra_circuit_builder.real_variable_index[elem]);
            }
        }
    }
    this->remove_unnecessary_decompose_variables(
        ultra_circuit_builder, this->variables_in_one_gate, decompose_varialbes);
    this->remove_unnecessary_plookup_variables(ultra_circuit_builder);
    this->remove_unnecessary_range_constrains_variables(ultra_circuit_builder);
    for (const auto& elem : this->fixed_variables) {
        this->variables_in_one_gate.erase(elem);
    }
    // we found variables that were in one gate and they are intended cases.
    // so we have to remove them from the scope
    for (const auto& elem : ultra_circuit_builder.get_used_witnesses()) {
        this->variables_in_one_gate.erase(elem);
    }
    this->remove_record_witness_variables(ultra_circuit_builder);
    return variables_in_one_gate;
}

/**
 * @brief this method returns connected component with a given index and its size
 * @param connected_components vector of all connected components
 * @param index index of required component
 * @return std::pair<std::vector<uint32_t>, size_t> pair of component and its size
 */

std::pair<std::vector<uint32_t>, size_t> get_connected_component_with_index(
    const std::vector<std::vector<uint32_t>>& connected_components, size_t index)
{
    auto connected_component = connected_components[index];
    auto size = connected_component.size();
    return std::make_pair(connected_component, size);
}

/**
 * @brief this method prints graph as vertices and their adjacency lists
 * example: we have an undirected graph from 3 variables: a, b, c.
 * we have edges: a - b, b - c, c - a.
 * so, there will be next adjacency lists:
 * a: b -> c -> 0\
 * b: a -> c -> 0\
 * c: a -> b -> 0\
 * @tparam FF
 */

template <typename FF> void Graph_<FF>::print_graph()
{
    for (const auto& elem : variable_adjacency_lists) {
        info("variable with index ", elem.first);
        if (variable_adjacency_lists[elem.first].empty()) {
            info("is isolated");
        } else {
            for (const auto& it : elem.second) {
                info(it);
            }
        }
    }
}

/**
 * @brief this method prints all connected components that were found in the graph
 * @tparam FF
 */

template <typename FF> void Graph_<FF>::print_connected_components()
{
    auto connected_components = find_connected_components();
    for (size_t i = 0; i < connected_components.size(); i++) {
        info("printing the ", i + 1, " connected component with size ", connected_components[i].size(), ":");
        for (const auto& it : connected_components[i]) {
            info(it, " ");
        }
    }
}

/**
 * @brief this method prints a number of gates for each variable
 * @tparam FF
 */

template <typename FF> void Graph_<FF>::print_variables_gate_counts()
{
    for (const auto& it : variables_gate_counts) {
        info("number of gates with variables ", it.first, " == ", it.second);
    }
}

/**
 * @brief this method prints all information about the gate where variable was found
 * @tparam FF
 * @param ultra_builder
 * @param real_idx
 */

template <typename FF>
void Graph_<FF>::print_variable_in_one_gate(bb::UltraCircuitBuilder& ultra_builder, const uint32_t real_idx)
{
    const auto& block_data = ultra_builder.blocks.get();
    for (const auto& [key, gates] : variable_gates) {
        if (key.first == real_idx) {
            ASSERT(gates.size() == 1);
            size_t gate_index = gates[0];
            UltraBlock block = block_data[key.second];
            info("---- printing variables in this gate");
            info("w_l == ",
                 block.w_l()[gate_index],
                 " w_r == ",
                 block.w_r()[gate_index],
                 " w_o == ",
                 block.w_o()[gate_index],
                 " w_4 == ",
                 block.w_4()[gate_index]);
            info("---- printing gate selectors where variable with index ", key.first, " was found ----");
            auto q_m = block.q_m()[gate_index];
            if (!q_m.is_zero()) {
                info("q_m == ", q_m);
            }
            auto q_1 = block.q_1()[gate_index];
            if (!q_1.is_zero()) {
                info("q1 == ", q_1);
            }
            auto q_2 = block.q_2()[gate_index];
            if (!q_2.is_zero()) {
                info("q2 == ", q_2);
            }
            auto q_3 = block.q_3()[gate_index];
            if (!q_3.is_zero()) {
                info("q3 == ", q_3);
            }
            auto q_4 = block.q_4()[gate_index];
            if (!q_4.is_zero()) {
                info("q4 == ", q_4);
            }
            auto q_c = block.q_c()[gate_index];
            if (!q_c.is_zero()) {
                info("q_c == ", q_c);
            }
            auto q_arith = block.q_arith()[gate_index];
            if (!q_arith.is_zero()) {
                info("q_arith == ", q_arith);
            }
            auto q_delta_range = block.q_delta_range()[gate_index];
            if (!q_delta_range.is_zero()) {
                info("q_delta_range == ", q_delta_range);
            }
            auto q_elliptic = block.q_elliptic()[gate_index];
            if (!q_elliptic.is_zero()) {
                info("q_elliptic == ", q_elliptic);
            }
            auto q_aux = block.q_aux()[gate_index];
            if (!q_aux.is_zero()) {
                info("q_aux == ", q_aux);
            }
            auto q_lookup_type = block.q_lookup_type()[gate_index];
            if (!q_lookup_type.is_zero()) {
                info("q_lookup_type == ", q_lookup_type);
            }
            auto q_poseidon2_external = block.q_poseidon2_external()[gate_index];
            if (!q_poseidon2_external.is_zero()) {
                info("q_poseidon2_external == ", q_poseidon2_external);
            }
            auto q_poseidon2_internal = block.q_poseidon2_internal()[gate_index];
            if (!q_poseidon2_internal.is_zero()) {
                info("q_poseidon2_internal == ", q_poseidon2_internal);
            }
            info("---- finished printing ----");
        }
    }
}

template class Graph_<bb::fr>;

} // namespace cdg
