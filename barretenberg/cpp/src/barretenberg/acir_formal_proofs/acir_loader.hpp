#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
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

private:
    std::string instruction_name;
    std::vector<uint8_t> acir_program_buf;
    std::vector<acir_format::AcirFormat> constraint_systems;
};