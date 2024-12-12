#include "acir_loader.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <fstream>
#include <string>
#include <vector>

std::vector<uint8_t> readFile(std::string filename)
{
    std::ifstream file(filename, std::ios::binary);
    file.unsetf(std::ios::skipws);

    std::streampos fileSize;

    file.seekg(0, std::ios::end);
    fileSize = file.tellg();
    file.seekg(0, std::ios::beg);

    std::vector<uint8_t> vec;

    vec.insert(vec.begin(), std::istream_iterator<uint8_t>(file), std::istream_iterator<uint8_t>());
    file.close();
    return vec;
}

AcirToSmtLoader::AcirToSmtLoader(std::string filename)
{
    this->acir_program_buf = readFile(filename);
    this->instruction_name = filename;
    this->constraint_system = acir_format::program_buf_to_acir_format(this->acir_program_buf, false).at(0);
    this->circuit_buf = this->get_circuit_builder().export_circuit();
}

bb::UltraCircuitBuilder AcirToSmtLoader::get_circuit_builder()
{
    bb::UltraCircuitBuilder builder = acir_format::create_circuit(this->constraint_system, false);
    builder.set_variable_name(0, "a");
    builder.set_variable_name(1, "b");
    builder.set_variable_name(2, "c");
    return builder;
}

smt_solver::Solver AcirToSmtLoader::get_smt_solver()
{
    smt_circuit::CircuitSchema circuit_info = smt_circuit_schema::unpack_from_buffer(this->circuit_buf);
    // for shl i have variable with bit length 197... for some reason
    return smt_solver::Solver(circuit_info.modulus, smt_circuit::default_solver_config, 16, 240);
}

smt_circuit::UltraCircuit AcirToSmtLoader::get_smt_circuit(smt_solver::Solver* solver)
{
    smt_circuit::CircuitSchema circuit_info = smt_circuit_schema::unpack_from_buffer(this->circuit_buf);
    return smt_circuit::UltraCircuit(circuit_info, solver, smt_terms::TermType::BVTerm);
}