// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "acir_format.hpp"

namespace bb {
acir_format::AcirFormatOriginalOpcodeIndices create_empty_original_opcode_indices();

void mock_opcode_indices(acir_format::AcirFormat& constraint_system);
} // namespace bb
