#pragma once
#include "eccvm_circuit_builder.hpp"
namespace bb {
class ECCVMTraceChecker {
  public:
    static bool check_circuit(ECCVMCircuitBuilder&);
};
} // namespace bb