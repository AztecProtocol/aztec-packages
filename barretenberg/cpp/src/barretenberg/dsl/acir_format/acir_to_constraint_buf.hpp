#pragma once
#include "acir_format.hpp"
#include "serde/index.hpp"

namespace acir_format {

/**
 * @brief Converts from the ACIR-native `WitnessStack` format to Barretenberg's internal `WitnessVector` format.
 *
 * @param buf Serialized representation of a `WitnessStack`.
 * @return A `WitnessVector` equivalent to the last `WitnessMap` in the stack.
 * @note This transformation results in all unassigned witnesses within the `WitnessMap` being assigned the value 0.
 *       Converting the `WitnessVector` back to a `WitnessMap` is unlikely to return the exact same `WitnessMap`.
 */
WitnessVector witness_buf_to_witness_data(std::vector<uint8_t> const& buf);

AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t> const& buf, uint32_t honk_recursion);

std::vector<AcirFormat> program_buf_to_acir_format(std::vector<uint8_t> const& buf, uint32_t honk_recursion);

WitnessVectorStack witness_buf_to_witness_stack(std::vector<uint8_t> const& buf);

AcirProgramStack get_acir_program_stack(std::string const& bytecode_path,
                                        std::string const& witness_path,
                                        uint32_t honk_recursion);
} // namespace acir_format
