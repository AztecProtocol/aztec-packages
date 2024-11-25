#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
<<<<<<< HEAD
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
=======
#include <vector>
#include <string>


class AcirInstructionLoader {
public:
    AcirInstructionLoader() = default;
    AcirInstructionLoader(const AcirInstructionLoader& other) = default;
    AcirInstructionLoader(AcirInstructionLoader&& other) = default;
    AcirInstructionLoader& operator=(const AcirInstructionLoader other) = delete;
    AcirInstructionLoader&& operator=(AcirInstructionLoader&& other) = delete;

    ~AcirInstructionLoader() = default; 

    AcirInstructionLoader(std::vector<uint8_t> const& acir_program_buf, std::string instruction_name);
    AcirInstructionLoader(std::string filename);
    
    std::vector<acir_format::AcirFormat> get_constraint_systems() { return this->constraint_systems; }

private:
    std::string instruction_name;
    std::vector<uint8_t> acir_program_buf;
    std::vector<acir_format::AcirFormat> constraint_systems;
>>>>>>> 56559cf7fce08564b1b28ebe20726ba486af2379
};