#pragma once
#include "barretenberg/bb/config.hpp"
#include "barretenberg/bb/file_io.hpp"
#include "barretenberg/bb/get_bytecode.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"

namespace bb {

acir_format::WitnessVector get_witness(std::string const& witness_path)
{
    auto witness_data = get_bytecode(witness_path);
    return acir_format::witness_buf_to_witness_data(witness_data);
}

acir_format::AcirFormat get_constraint_system(std::string const& bytecode_path, bool honk_recursion)
{
    auto bytecode = get_bytecode(bytecode_path);
    return acir_format::circuit_buf_to_acir_format(bytecode, honk_recursion);
}

acir_format::WitnessVectorStack get_witness_stack(std::string const& witness_path)
{
    auto witness_data = get_bytecode(witness_path);
    return acir_format::witness_buf_to_witness_stack(witness_data);
}

std::vector<acir_format::AcirFormat> get_constraint_systems(std::string const& bytecode_path, bool honk_recursion)
{
    auto bytecode = get_bytecode(bytecode_path);
    return acir_format::program_buf_to_acir_format(bytecode, honk_recursion);
}

} // namespace bb