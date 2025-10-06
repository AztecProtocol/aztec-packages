#pragma once
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <list>
#include <set>
#include <typeinfo>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace cdg {
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

struct ConnectedComponent {
    std::vector<uint32_t> variable_indices;
    bool is_range_list_cc;
    bool is_finalize_cc;
    ConnectedComponent() = default;
    ConnectedComponent(const std::vector<uint32_t>& vector)
        : variable_indices(vector)
        , is_range_list_cc(false)
        , is_finalize_cc(false) {};
    size_t size() const { return variable_indices.size(); }
    const std::vector<uint32_t>& vars() const { return variable_indices; }
};

/*
 * This class describes an arithmetic circuit as an undirected graph, where vertices are variables from the circuit.
 * Edges describe connections between variables through gates. We want to find variables that weren't properly
 * constrained or where some connections were missed using additional metrics, such as how many gates a variable appears
 * in and the number of connected components in the graph. If a variable appears in only one gate, it means that this
 * variable wasn't constrained properly. If the number of connected components > 1, it means that there were some missed
 * connections between variables.
 */
template <typename FF, typename CircuitBuilder> class StaticAnalyzer_ {
  public:
    StaticAnalyzer_() = default;
    StaticAnalyzer_(const StaticAnalyzer_& other) = delete;
    StaticAnalyzer_(StaticAnalyzer_&& other) = delete;
    StaticAnalyzer_& operator=(const StaticAnalyzer_& other) = delete;
    StaticAnalyzer_&& operator=(StaticAnalyzer_&& other) = delete;
    StaticAnalyzer_(CircuitBuilder& circuit_builder, bool connect_variables = true);

    /**
     * @brief Convert a vector of variable indices to their real indices
     * @param variable_indices The vector of variable indices to convert
     * @return std::vector<uint32_t> A vector of real variable indices
     */
    std::vector<uint32_t> to_real(std::vector<uint32_t>& variable_indices)
    {
        std::vector<uint32_t> real_variable_indices;
        real_variable_indices.reserve(variable_indices.size());
        for (auto& variable_index : variable_indices) {
            real_variable_indices.push_back(to_real(variable_index));
        }
        return real_variable_indices;
    };
    uint32_t to_real(const uint32_t& variable_index) const
    {
        return circuit_builder.real_variable_index[variable_index];
    }
    size_t find_block_index(const auto& block);
    void process_gate_variables(std::vector<uint32_t>& gate_variables, size_t gate_index, size_t blk_idx);
    std::unordered_map<uint32_t, size_t> get_variables_gate_counts() const { return this->variables_gate_counts; };

    void process_execution_trace();

    std::vector<std::vector<uint32_t>> get_arithmetic_gate_connected_component(size_t index,
                                                                               size_t block_idx,
                                                                               auto& blk);
    std::vector<uint32_t> get_elliptic_gate_connected_component(size_t index, size_t block_idx, auto& blk);
    std::vector<uint32_t> get_plookup_gate_connected_component(size_t index, size_t block_idx, auto& blk);
    std::vector<uint32_t> get_sort_constraint_connected_component(size_t index, size_t block_idx, auto& blk);
    std::vector<uint32_t> get_poseido2s_gate_connected_component(size_t index, size_t block_idx, auto& blk);
    std::vector<uint32_t> get_non_native_field_gate_connected_component(size_t index, size_t block_idx, auto& blk);
    std::vector<uint32_t> get_memory_gate_connected_component(size_t index, size_t block_idx, auto& blk);
    std::vector<uint32_t> get_rom_table_connected_component(const bb::RomTranscript& rom_array);
    std::vector<uint32_t> get_ram_table_connected_component(const bb::RamTranscript& ram_array);
    // functions for MegaCircuitBuilder
    std::vector<uint32_t> get_databus_connected_component(size_t index, size_t block_idx, auto& blk);
    std::vector<uint32_t> get_eccop_connected_component(size_t index, size_t block_idx, auto& blk);
    std::vector<uint32_t> get_eccop_part_connected_component(size_t index, size_t block_idx, auto& blk);

    void add_new_edge(const uint32_t& first_variable_index, const uint32_t& second_variable_index);
    void depth_first_search(const uint32_t& variable_index,
                            std::unordered_set<uint32_t>& is_used,
                            std::vector<uint32_t>& connected_component);
    void mark_range_list_connected_components();
    void mark_finalize_connected_components();
    std::vector<ConnectedComponent> find_connected_components(bool return_all_connected_components = false);
    bool check_vertex_in_connected_component(const std::vector<uint32_t>& connected_component,
                                             const uint32_t& var_index);
    void connect_all_variables_in_vector(const std::vector<uint32_t>& variables_vector);
    bool check_is_not_constant_variable(const uint32_t& variable_index);

    std::pair<std::vector<uint32_t>, size_t> get_connected_component_with_index(
        const std::vector<std::vector<uint32_t>>& connected_components, size_t index);

    size_t process_current_decompose_chain(size_t index);
    void process_current_plookup_gate(size_t gate_index);
    void remove_unnecessary_decompose_variables(const std::unordered_set<uint32_t>& decompose_variables);
    void remove_unnecessary_plookup_variables();
    void remove_unnecessary_range_constrains_variables();
    std::unordered_set<uint32_t> get_variables_in_one_gate();

    void remove_unnecessary_aes_plookup_variables(bb::plookup::BasicTableId& table_id, size_t gate_index);
    void remove_unnecessary_sha256_plookup_variables(bb::plookup::BasicTableId& table_id, size_t gate_index);
    void remove_record_witness_variables();

    void print_connected_components_info();
    void print_variables_gate_counts();
    void print_variable_in_one_gate(const uint32_t real_idx);

    std::pair<std::vector<ConnectedComponent>, std::unordered_set<uint32_t>> analyze_circuit();
    ~StaticAnalyzer_() = default;

  private:
    // Store reference to the circuit builder
    CircuitBuilder& circuit_builder;
    bool connect_variables;

    std::unordered_map<uint32_t, std::vector<uint32_t>>
        variable_adjacency_lists; // we use this data structure to contain information about variables and their
                                  // connections between each other
    std::unordered_map<uint32_t, size_t>
        variables_gate_counts; // we use this data structure to count, how many gates use every variable
    std::unordered_map<uint32_t, size_t>
        variables_degree; // we use this data structure to count, how many every variable have edges
    std::unordered_map<KeyPair, std::vector<size_t>, KeyHasher, KeyEquals>
        variable_gates; // we use this data structure to store gates and TraceBlocks for every variables, where static
                        // analyzer finds them in the circuit.
    std::unordered_set<uint32_t> variables_in_one_gate;
    std::unordered_set<uint32_t> fixed_variables;
    std::vector<ConnectedComponent> connected_components;
    std::vector<ConnectedComponent>
        main_connected_components; // connected components without finalize blocks and range lists
};

// Type aliases for convenience
using UltraStaticAnalyzer = StaticAnalyzer_<bb::fr, bb::UltraCircuitBuilder>;
using MegaStaticAnalyzer = StaticAnalyzer_<bb::fr, bb::MegaCircuitBuilder>;
using StaticAnalyzer = UltraStaticAnalyzer; // Default to Ultra for backward compatibility

} // namespace cdg
