#pragma once

#include <cstdint>
#include <vector>

namespace bb::avm {

/**
 * @brief Simulate a transaction from its hinted inputs, reading no world state or contract DB.
 *
 * @param inputs A msgpack AvmProvingInputs, whose hints answer every read the simulation makes.
 * @return The msgpack TxSimulationResult.
 */
std::vector<uint8_t> simulate_with_hints(const std::vector<uint8_t>& inputs);

} // namespace bb::avm
