#include "acir_graph.hpp"
#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <iostream>
#include <string>

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

    // 2. Count ACIR-level connected components
    acir_components_count::AcirGraph acir_graph;
    acir_graph.set_max_witness_index(constraint_system.max_witness_index);
    acir_graph.process_acir_constraints(constraint_system);
    size_t acir_components = acir_graph.count_components();

    // 3. Build circuit (without finalizing — finalization creates internal range-list CCs
    // that don't correspond to ACIR-level components) and count circuit-level connected components.
    acir_format::AcirProgram program{ .constraints = constraint_system, .witness = {} };
    auto builder = acir_format::create_circuit<bb::UltraCircuitBuilder>(program);
    cdg::UltraStaticAnalyzer analyzer(builder);
    auto circuit_cc = analyzer.find_connected_components();

    // Filter circuit CCs to only those containing at least one ACIR witness variable.
    uint32_t max_witness = constraint_system.max_witness_index;
    std::unordered_set<uint32_t> acir_real_indices;
    for (uint32_t i = 0; i <= max_witness; i++) {
        acir_real_indices.insert(builder.real_variable_index[i]);
    }
    auto contains_acir_witness = [&acir_real_indices](const cdg::ConnectedComponent& cc) {
        return std::any_of(cc.vars().begin(), cc.vars().end(), [&acir_real_indices](uint32_t v) {
            return acir_real_indices.contains(v);
        });
    };
    size_t circuit_components =
        static_cast<size_t>(std::count_if(circuit_cc.begin(), circuit_cc.end(), contains_acir_witness));

    // Collect ACIR witness real indices that are already in some filtered CC.
    std::unordered_set<uint32_t> vars_in_ccs;
    for (const auto& cc : circuit_cc) {
        if (contains_acir_witness(cc)) {
            for (auto v : cc.vars()) {
                vars_in_ccs.insert(v);
            }
        }
    }

    // Count ACIR witness variables not in any CC but still constrained — either they appear
    // in gates (degree-0, e.g. bool gates for 1-bit range checks) or in pending range_lists
    // (whose delta_range gates aren't created until finalize_circuit, which we skip).
    auto gate_counts = analyzer.get_variables_gate_counts();
    std::unordered_set<uint32_t> range_list_vars;
    for (const auto& [_, range_list] : builder.range_lists) {
        for (auto var_idx : range_list.variable_indices) {
            range_list_vars.insert(builder.real_variable_index[var_idx]);
        }
    }
    for (uint32_t i = 0; i <= max_witness; i++) {
        uint32_t real_idx = builder.real_variable_index[i];
        if (vars_in_ccs.contains(real_idx)) {
            continue;
        }
        bool in_gate = gate_counts.count(real_idx) && gate_counts.at(real_idx) > 0;
        bool in_range_list = range_list_vars.contains(real_idx);
        if (in_gate || in_range_list) {
            circuit_components++;
            vars_in_ccs.insert(real_idx); // avoid double-counting aliased witnesses
        }
    }

    // 4. Compare
    if (acir_components != circuit_components) {
        std::cerr << "MISMATCH: ACIR has " << acir_components << " components, circuit has " << circuit_components
                  << " components." << std::endl;
        analyzer.print_connected_components_info();
        for (const auto& c : circuit_cc) {
            std::cout << "Variables: ";
            for (const auto& v : c.vars()) {
                std::cout << v << " ";
            }
            std::cout << std::endl;
        }
        for (const auto& v : analyzer.get_variables_in_one_gate()) {
            std::cout << v << " ";
            analyzer.print_variable_info(v);
        }
        std::cout << std::endl;
        return 1;
    }

    return 0;
}
