// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/serialize/msgpack.hpp"

#include <array>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace bb {

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
 * @param lookup_tables List of lookup tables
 * @param real_variable_tag Variables' tags for range constraints
 * @param range_lists Existing range lists
 */
template <typename FF> struct CircuitSchemaInternal {
    std::string modulus;
    std::vector<uint32_t> public_inps;
    std::unordered_map<uint32_t, std::string> vars_of_interest;
    std::vector<FF> variables;
    std::vector<std::vector<std::vector<FF>>> selectors;
    std::vector<std::vector<std::vector<uint32_t>>> wires;
    std::vector<uint32_t> real_variable_index;
    std::vector<std::vector<std::vector<FF>>> lookup_tables;
    std::vector<uint32_t> real_variable_tags;
    std::unordered_map<uint32_t, uint64_t> range_tags;
    std::vector<std::vector<std::vector<uint32_t>>> rom_records;
    std::vector<std::vector<std::array<uint32_t, 2>>> rom_states;
    std::vector<std::vector<std::vector<uint32_t>>> ram_records;
    std::vector<std::vector<uint32_t>> ram_states;
    bool circuit_finalized;
    SERIALIZATION_FIELDS(modulus,
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

} // namespace bb
