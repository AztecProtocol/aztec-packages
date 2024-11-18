#include "acir_loader.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <vector>
#include <string>


AcirInstructionLoader::AcirInstructionLoader(std::vector<uint8_t> const& acir_bytes, std::string instruction_name) 
{
    this->acir_program_buf = acir_bytes;
    this->instruction_name = instruction_name;
    this->constraint_systems = acir_format::program_buf_to_acir_format(acir_bytes, false);
}