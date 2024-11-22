#include "acir_loader.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <vector>
#include <string>
#include <fstream>


std::vector<uint8_t> readFile(std::string filename)
{
    std::ifstream file(filename, std::ios::binary);
    file.unsetf(std::ios::skipws);

    std::streampos fileSize;

    file.seekg(0, std::ios::end);
    fileSize = file.tellg();
    file.seekg(0, std::ios::beg);

    std::vector<uint8_t> vec;

    vec.insert(vec.begin(),
               std::istream_iterator<uint8_t>(file),
               std::istream_iterator<uint8_t>());
    file.close();
    return vec;
}


AcirInstructionLoader::AcirInstructionLoader(std::vector<uint8_t> const& acir_bytes, std::string instruction_name) 
{
    this->acir_program_buf = acir_bytes;
    this->instruction_name = instruction_name;
    this->constraint_systems = acir_format::program_buf_to_acir_format(acir_bytes, false);
}

AcirInstructionLoader::AcirInstructionLoader(std::string filename) {
    this->acir_program_buf = readFile(filename);
    this->instruction_name = filename;
    this->constraint_systems = acir_format::program_buf_to_acir_format(this->acir_program_buf, false);
}