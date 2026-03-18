#include "acir_graph.hpp"
#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <iostream>
#include <string>

// Sentinel value for witnesses not found in any circuit component.
static constexpr size_t NO_CIRCUIT_CC = SIZE_MAX;

int main(int argc, char* argv[])
{
    if (argc < 2) {
        std::cerr << "Usage: acir_components_count <bytecode_path>" << std::endl;
        return 1;
    }

    std::string bytecode_path = argv[1];

    // 1. Read and deserialize ACIR bytecode
    auto bytecode = get_bytecode(bytecode_path);
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(bytecode));

    // 2. Build ACIR-level component map: witness_index → acir_component_id
    acir_components_count::AcirGraph acir_graph;
    acir_graph.set_max_witness_index(constraint_system.max_witness_index);
    acir_graph.process_acir_constraints(constraint_system);
    auto acir_witness_map = acir_graph.get_witness_component_map();

    // 3. Build circuit and find connected components
    acir_format::AcirProgram program{ .constraints = constraint_system, .witness = {} };
    auto builder = acir_format::create_circuit<bb::UltraCircuitBuilder>(program);
    cdg::UltraStaticAnalyzer analyzer(builder);
    auto circuit_cc = analyzer.find_connected_components();

    // 4. Build circuit-level component map: acir_witness_real_index → circuit_component_id
    //    Also handle singletons (degree-0 witnesses in gates or range_lists).
    uint32_t max_witness = constraint_system.max_witness_index;

    // Map each circuit CC variable to its CC index
    std::unordered_map<uint32_t, size_t> circuit_var_to_cc;
    for (size_t cc_id = 0; cc_id < circuit_cc.size(); cc_id++) {
        for (auto v : circuit_cc[cc_id].vars()) {
            circuit_var_to_cc[v] = cc_id;
        }
    }

    // For singleton detection
    auto gate_counts = analyzer.get_variables_gate_counts();
    std::unordered_set<uint32_t> range_list_vars;
    for (const auto& [_, range_list] : builder.range_lists) {
        for (auto var_idx : range_list.variable_indices) {
            range_list_vars.insert(builder.real_variable_index[var_idx]);
        }
    }

    // Build set of constant variable indices (from put_constant_variable cache).
    // Witnesses whose real_variable_index maps to a constant are maximally constrained.
    std::unordered_set<uint32_t> constant_var_set;
    for (const auto& [_, var_idx] : builder.constant_variable_indices) {
        constant_var_set.insert(var_idx);
    }

    // Assign each singleton/constant a unique "virtual CC" id (starting after real CCs)
    size_t next_virtual_id = circuit_cc.size();
    std::unordered_map<uint32_t, size_t> virtual_cc_ids; // real_idx → virtual cc id

    // Build: acir_witness → circuit_cc_id (real CC id, or virtual id, or NO_CIRCUIT_CC)
    std::unordered_map<uint32_t, size_t> circuit_witness_map;
    for (uint32_t i = 0; i <= max_witness; i++) {
        uint32_t real_idx = builder.real_variable_index[i];

        // Check if in a real CC
        auto it = circuit_var_to_cc.find(real_idx);
        if (it != circuit_var_to_cc.end()) {
            circuit_witness_map[i] = it->second;
            continue;
        }

        // Check if mapped to a constant variable (e.g., via assert_equal to zero_idx).
        // This is maximally constrained — the witness is fixed to the constant value.
        if (constant_var_set.contains(real_idx)) {
            if (!virtual_cc_ids.contains(real_idx)) {
                virtual_cc_ids[real_idx] = next_virtual_id++;
            }
            circuit_witness_map[i] = virtual_cc_ids[real_idx];
            continue;
        }

        // Check if it's a singleton (in a gate or range_list but not in any CC)
        bool in_gate = gate_counts.count(real_idx) && gate_counts.at(real_idx) > 0;
        bool in_range_list = range_list_vars.contains(real_idx);
        if (in_gate || in_range_list) {
            if (!virtual_cc_ids.contains(real_idx)) {
                virtual_cc_ids[real_idx] = next_virtual_id++;
            }
            circuit_witness_map[i] = virtual_cc_ids[real_idx];
            continue;
        }

        circuit_witness_map[i] = NO_CIRCUIT_CC;
    }

    // 5. Structural comparison: for each ACIR component, check that all its witnesses
    //    map to the same circuit component. Report any splits or disappearances.
    bool has_error = false;

    // Group ACIR witnesses by their ACIR component
    std::unordered_map<size_t, std::vector<uint32_t>> acir_comp_witnesses;
    for (const auto& [witness, acir_comp] : acir_witness_map) {
        acir_comp_witnesses[acir_comp].push_back(witness);
    }

    for (const auto& [acir_comp, witnesses] : acir_comp_witnesses) {
        // Find the circuit CC for each witness in this ACIR component
        std::unordered_set<size_t> circuit_ccs_seen;
        std::vector<uint32_t> unconstrained_witnesses;

        for (auto w : witnesses) {
            if (w > max_witness) {
                continue; // internal ACIR witness beyond max_witness_index
            }
            auto it = circuit_witness_map.find(w);
            if (it == circuit_witness_map.end() || it->second == NO_CIRCUIT_CC) {
                unconstrained_witnesses.push_back(w);
            } else {
                circuit_ccs_seen.insert(it->second);
            }
        }

        // Error: ACIR component split across multiple circuit components
        if (circuit_ccs_seen.size() > 1) {
            has_error = true;
            std::cerr << "SPLIT: ACIR component " << acir_comp << " is split across " << circuit_ccs_seen.size()
                      << " circuit components. Witnesses: ";
            for (auto w : witnesses) {
                if (w <= max_witness) {
                    std::cerr << "w" << w << "(cc=";
                    auto cit = circuit_witness_map.find(w);
                    if (cit != circuit_witness_map.end() && cit->second != NO_CIRCUIT_CC) {
                        std::cerr << cit->second;
                    } else {
                        std::cerr << "none";
                    }
                    std::cerr << ") ";
                }
            }
            std::cerr << std::endl;
        }

        // Error: ACIR component has witnesses unconstrained at circuit level
        if (!unconstrained_witnesses.empty()) {
            has_error = true;
            std::cerr << "UNCONSTRAINED: ACIR component " << acir_comp << " has "
                      << unconstrained_witnesses.size() << " witness(es) missing from circuit: ";
            for (auto w : unconstrained_witnesses) {
                std::cerr << "w" << w << " ";
            }
            std::cerr << std::endl;
        }
    }

    if (has_error) {
        std::cerr << "ACIR components: " << acir_graph.count_components() << std::endl;
        analyzer.print_connected_components_info();
        for (const auto& v : analyzer.get_variables_in_one_gate()) {
            std::cout << v << " ";
            analyzer.print_variable_info(v);
        }
        std::cout << std::endl;
        return 1;
    }

    return 0;
}
