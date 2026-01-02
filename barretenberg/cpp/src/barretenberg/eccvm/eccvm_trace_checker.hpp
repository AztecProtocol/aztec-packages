// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "eccvm_circuit_builder.hpp"

namespace bb {
class ECCVMTraceChecker {
  public:
    static bool check(ECCVMCircuitBuilder&,
                      numeric::RNG* engine_ptr = nullptr
#ifdef FUZZING
                      ,
                      bool disable_fixed_dyadic_trace_size = false
#endif
    );
};
} // namespace bb