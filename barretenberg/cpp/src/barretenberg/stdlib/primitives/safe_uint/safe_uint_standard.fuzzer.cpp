// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/common/fuzzer_constants.hpp"
constexpr uint64_t FuzzerCircuitTypes = CircuitType::Standard;
#include "safe_uint.fuzzer.hpp"
