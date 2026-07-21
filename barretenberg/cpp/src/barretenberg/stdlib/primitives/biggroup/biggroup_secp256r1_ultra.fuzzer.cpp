// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/common/fuzzer_constants.hpp"
constexpr uint64_t FuzzerCircuitTypes = CircuitType::Ultra;
constexpr uint64_t BigCurveTypes = BigCurveType::Secp256r1;
#include "biggroup.fuzzer.hpp"
