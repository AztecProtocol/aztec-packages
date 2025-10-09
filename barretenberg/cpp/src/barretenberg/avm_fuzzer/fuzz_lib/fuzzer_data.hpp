#pragma once
#include "instruction.hpp"
#include <vector>

#include <cstdint>

/// @brief describes the data which will be used for fuzzing
/// Should contain instructions, calldata, CFG instructions, options to disable/enable instructions, etc
struct FuzzerData {
    std::vector<Instruction> instructions;
    std::vector<bb::avm2::FF> calldata;
    // TODO(defkit) CFG + other options
};
