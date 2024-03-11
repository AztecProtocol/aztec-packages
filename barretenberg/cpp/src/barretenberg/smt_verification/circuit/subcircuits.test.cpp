#include <iostream>
#include <string>

#include "barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

#include "barretenberg/smt_verification/circuit/circuit.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

// These tests are aimed to find the index of the result value
// wires indices selectors
TEST(Subcircuits, range_circuit)
{
    for (size_t i = 0; i < 256; i++) {
        smt_schema::CircuitSchema range_circuit = smt_subcircuits::get_standard_range_constraint_circuit(i);
        info(i, " bits. ", range_circuit.selectors.size(), " gates.");
        for (size_t j = 0; j < range_circuit.selectors.size(); j++) {
            uint32_t wl = range_circuit.wires[j][0];
            uint32_t wr = range_circuit.wires[j][1];
            uint32_t wo = range_circuit.wires[j][2];

            if (range_circuit.vars_of_interest[wl] == "a") {
                info("Gate #", j, " Wire: ", 0);
            } else if (range_circuit.vars_of_interest[wr] == "a") {
                info("Gate #", j, " Wire: ", 1);
            } else if (range_circuit.vars_of_interest[wo] == "a") {
                info("Gate #", j, " Wire: ", 2);
            }
        }
        info();
    }
}
