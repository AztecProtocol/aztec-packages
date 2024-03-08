#pragma once
#include <fstream>

#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace smt_circuit_schema {

struct CircuitSchema {
    std::string modulus;
    std::vector<uint32_t> public_inps;
    std::unordered_map<uint32_t, std::string> vars_of_interest;
    std::vector<bb::fr> variables;
    std::vector<std::vector<bb::fr>> selectors;
    std::vector<std::vector<uint32_t>> wires;
    std::vector<uint32_t> real_variable_index;
    MSGPACK_FIELDS(modulus, public_inps, vars_of_interest, variables, selectors, wires, real_variable_index);
};

CircuitSchema unpack_from_buffer(const msgpack::sbuffer& buf);
CircuitSchema unpack_from_file(const std::string& filename);
void print_schema_for_use_in_python(CircuitSchema& cir);
} // namespace smt_circuit_schema