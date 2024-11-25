#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <string>
#include <vector>

class AcirToSmtLoader {
  public:
    AcirToSmtLoader() = delete;
    AcirToSmtLoader(const AcirToSmtLoader& other) = delete;
    AcirToSmtLoader(AcirToSmtLoader&& other) = delete;
    AcirToSmtLoader& operator=(const AcirToSmtLoader other) = delete;
    AcirToSmtLoader&& operator=(AcirToSmtLoader&& other) = delete;

    ~AcirToSmtLoader() = default;
    AcirToSmtLoader(std::string filename);

    acir_format::AcirFormat get_constraint_systems() { return this->constraint_system; }
    smt_solver::Solver get_solver();
    smt_circuit::UltraCircuit get_circuit(smt_solver::Solver* solver);

  private:
    std::string instruction_name;
    std::vector<uint8_t> acir_program_buf;
    acir_format::AcirFormat constraint_system;
    msgpack::sbuffer circuit_buf;
};