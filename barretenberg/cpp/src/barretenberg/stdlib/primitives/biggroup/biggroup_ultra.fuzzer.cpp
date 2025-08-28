// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/common/fuzzer_constants.hpp"
constexpr uint64_t FuzzerCircuitTypes = CircuitType::Ultra;
#include "biggroup.fuzzer.hpp"

/**
 * @brief Fuzzer entry function
 *
 */
extern "C" size_t LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    RunWithBuilders<BigGroupBase, FuzzerCircuitTypes>(Data, Size, VarianceRNG);
    return 0;
}
