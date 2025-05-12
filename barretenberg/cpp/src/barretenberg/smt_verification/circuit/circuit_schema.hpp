#pragma once
#include <fstream>

#include "barretenberg/serialize/msgpack_impl.hpp"

namespace smt_circuit_schema {

/**
 * @brief Serialized state of a circuit
 *
 * @details Used to transfer the state of the circuit
 * to Symbolic Circuit class.
 * Symbolic circuit is then used to produce SMT statements
 * that describe needed properties of the circuit.
 *
 * @param modulus Modulus of the field we are working with
 * @param public_inps Public inputs to the current circuit
 * @param vars_of_interest Map wires indices to their given names
 * @param variables List of wires values in the current circuit
 * @param selectors List of selectors in the current circuit
 * @param wires List of wires indices for each selector
 * @param real_variable_index Encoded copy constraints
 */
struct CircuitSchema {
    std::string modulus;
    std::vector<uint32_t> public_inps;
    std::unordered_map<uint32_t, std::string> vars_of_interest;
    std::vector<bb::fr> variables;
    std::vector<std::vector<std::vector<bb::fr>>> selectors;
    std::vector<std::vector<std::vector<uint32_t>>> wires;
    std::vector<uint32_t> real_variable_index;
    std::vector<std::vector<std::vector<bb::fr>>> lookup_tables;
    std::vector<uint32_t> real_variable_tags;
    std::unordered_map<uint32_t, uint64_t> range_tags;
    std::vector<std::vector<std::vector<uint32_t>>> rom_records;
    std::vector<std::vector<std::array<uint32_t, 2>>> rom_states;
    std::vector<std::vector<std::vector<uint32_t>>> ram_records;
    std::vector<std::vector<uint32_t>> ram_states;
    bool circuit_finalized;
    MSGPACK_FIELDS(modulus,
                   public_inps,
                   vars_of_interest,
                   variables,
                   selectors,
                   wires,
                   real_variable_index,
                   lookup_tables,
                   real_variable_tags,
                   range_tags,
                   rom_records,
                   rom_states,
                   ram_records,
                   ram_states,
                   circuit_finalized);
};

CircuitSchema unpack_from_buffer(const msgpack::sbuffer& buf);
CircuitSchema unpack_from_file(const std::string& filename);
void print_schema_for_use_in_python(CircuitSchema& cir);
} // namespace smt_circuit_schema
