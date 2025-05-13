#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"

namespace bb {
acir_format::WitnessVector get_witness(std::string const& witness_path);
acir_format::AcirFormat get_constraint_system(std::string const& bytecode_path);
acir_format::WitnessVectorStack get_witness_stack(std::string const& witness_path);
std::vector<acir_format::AcirFormat> get_constraint_systems(std::string const& bytecode_path);
} // namespace bb
