#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "components_check.hpp"
#include <iostream>

int main(int argc, char* argv[])
{
    if (argc < 2) {
        std::cerr << "Usage: acir_components_check <bytecode_path>\n";
        return 1;
    }

    auto bytecode = get_bytecode(argv[1]);
    auto constraints = acir_format::circuit_buf_to_acir_format(std::move(bytecode));

    acir_format::AcirProgram program{ .constraints = constraints, .witness = {} };
    auto builder = acir_format::create_circuit<bb::UltraCircuitBuilder>(program);

    acir_components_check::ComponentsChecker checker(constraints, builder);
    auto errors = checker.check();

    for (const auto& err : errors) {
        std::cerr << err.message << "\n";
    }

    return errors.empty() ? 0 : 1;
}
