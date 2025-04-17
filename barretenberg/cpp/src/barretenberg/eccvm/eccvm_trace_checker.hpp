// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "eccvm_circuit_builder.hpp"

namespace bb {
class ECCVMTraceChecker {
  public:
    static bool check(ECCVMCircuitBuilder&, numeric::RNG* engine_ptr = nullptr);
};
} // namespace bb