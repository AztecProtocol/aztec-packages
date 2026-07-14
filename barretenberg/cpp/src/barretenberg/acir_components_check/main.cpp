/**
 * CLI: load compiled ACIR bytecode, synthesize an `UltraCircuitBuilder`, and run
 * `acir_components_check::ComponentsChecker`.
 *
 * Input: path to bytecode (same formats as `get_bytecode` — e.g. gzip-compressed or JSON, depending
 * on build). The program must deserialize to `Acir::ProgramWithoutBrillig` with exactly one function.
 *
 * Exit codes: 0 if no SPLIT/UNCONSTRAINED issues; 1 if any error message was produced; 1 also for
 * bad usage. Brillig is excluded by the `ProgramWithoutBrillig` wire format.
 */
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "components_check.hpp"
#include <iostream>

int main(int argc, char* argv[])
{
    using CircuitBuilder = bb::UltraCircuitBuilder;

    if (argc < 2) {
        std::cerr << "Usage: acir_components_check <bytecode_path>\n";
        return 1;
    }

    auto bytecode = get_bytecode(argv[1]);
    auto parsed_program = acir_format::deserialize_msgpack_compact<Acir::ProgramWithoutBrillig>(
        std::move(bytecode), [](auto o) -> Acir::ProgramWithoutBrillig {
            Acir::ProgramWithoutBrillig program_without_brillig;
            try {
                o.convert(program_without_brillig);
            } catch (const msgpack::type_error&) {
                std::cerr << o << std::endl;
                bb::assert_failure("acir_components_check: failed to convert msgpack data to ProgramWithoutBrillig");
            }
            return program_without_brillig;
        });
    BB_ASSERT_EQ(
        parsed_program.functions.size(), 1U, "acir_components_check: expected single function in ACIR program");

    const auto& circuit = parsed_program.functions[0];
    auto constraints = acir_format::circuit_serde_to_acir_format(circuit, IsMegaBuilder<CircuitBuilder>);

    acir_format::AcirProgram program{ .constraints = constraints, .witness = {} };
    auto builder = acir_format::create_circuit<CircuitBuilder>(program);

    acir_components_check::ComponentsChecker checker(circuit, builder);
    auto errors = checker.check();

    for (const auto& err : errors) {
        std::cerr << err.message << "\n";
    }

    return errors.empty() ? 0 : 1;
}
