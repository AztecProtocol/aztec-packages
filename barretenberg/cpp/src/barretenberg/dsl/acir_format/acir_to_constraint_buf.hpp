// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

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
WitnessVector witness_buf_to_witness_data(std::vector<uint8_t>&& buf);

AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t>&& buf);

std::vector<AcirFormat> program_buf_to_acir_format(std::vector<uint8_t>&& buf);

WitnessVectorStack witness_buf_to_witness_stack(std::vector<uint8_t>&& buf);

AcirProgramStack get_acir_program_stack(std::string const& bytecode_path, std::string const& witness_path);
} // namespace acir_format
