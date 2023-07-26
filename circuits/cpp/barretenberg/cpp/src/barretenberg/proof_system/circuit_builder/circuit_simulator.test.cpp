#include "circuit_simulator.hpp"
#include <gtest/gtest.h>

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::circuit_simulator_tests {

class CircuitSimulatorBN254Test : public ::testing::Test {};

TEST(CircuitSimulatorBN254Test, Base)
{
    CircuitSimulatorBN254 circuit;
}

// TODO: Add more tests.

} // namespace proof_system::circuit_simulator_tests