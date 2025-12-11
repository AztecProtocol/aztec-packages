// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "acir_format.hpp"

namespace acir_format {

/**
 * @brief Create a empty instance of the AcirFormatOriginalOpcodeIndices struct. Used for testing purposes.
 */
AcirFormatOriginalOpcodeIndices create_empty_original_opcode_indices();

/**
 * @brief Mock the opcode indices of the constraints in an AcirFormat. Used for testing purposes.
 *
 * @param constraint_system
 */
void mock_opcode_indices(AcirFormat& constraint_system);

} // namespace acir_format
