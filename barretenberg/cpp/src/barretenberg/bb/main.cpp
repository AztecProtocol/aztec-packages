#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-conversion"
#pragma clang diagnostic ignored "-Wshorten-64-to-32"
#pragma clang diagnostic ignored "-Wunused-parameter"
#include "barretenberg/bb/cli.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"

int main(int argc, char* argv[])
{
    std::cout << sizeof(Acir::Opcode) << std::endl;
    // print the sizes for each variant case
    std::cout << sizeof(Acir::Opcode::AssertZero) << std::endl;
    std::cout << sizeof(Acir::Opcode::BlackBoxFuncCall) << std::endl;
    std::cout << sizeof(Acir::Opcode::MemoryOp) << std::endl;
    std::cout << sizeof(Acir::Opcode::MemoryInit) << std::endl;
    std::cout << sizeof(Acir::Opcode::BrilligCall) << std::endl;
    std::cout << sizeof(Acir::Opcode::Call) << std::endl;
    return bb::parse_and_run_cli_command(argc, argv);
}
