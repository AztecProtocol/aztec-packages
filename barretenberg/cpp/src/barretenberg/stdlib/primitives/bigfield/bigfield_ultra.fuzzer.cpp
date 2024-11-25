#include "barretenberg/common/fuzzer_constants.hpp"
#define ULTRA_FUZZ
constexpr uint64_t FuzzerCircuitTypes = CircuitType::Ultra;
#include "bigfield.fuzzer.hpp"
