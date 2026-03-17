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
    acir_graph.process_acir_constraints(constraint_system);
    size_t acir_components = acir_graph.count_components();

    // 3. Build circuit and count circuit-level connected components
    acir_format::AcirProgram program{ .constraints = constraint_system, .witness = {} };
    auto builder = acir_format::create_circuit<bb::UltraCircuitBuilder>(program);
    cdg::UltraStaticAnalyzer analyzer(builder);
    auto circuit_cc = analyzer.find_connected_components();
    size_t circuit_components = circuit_cc.size();

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
