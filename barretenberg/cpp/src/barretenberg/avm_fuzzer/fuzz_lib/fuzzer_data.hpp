#pragma once
#include "instruction.hpp"
#include <vector>

#include <cstdint>

/// @brief describes the data which will be used for fuzzing
/// Should contain instructions, calldata, CFG instructions, options to disable/enable instructions, etc
struct FuzzerData {
    std::vector<FuzzInstruction> instructions;
    std::vector<bb::avm2::FF> calldata;
    // TODO(defkit) CFG + other options
    // InsertInstruction
};

#include <iostream>

inline std::ostream& operator<<(std::ostream& os, const FuzzerData& data)
{
    os << "FuzzerData {\n";
    os << "  instructions: [\n";
    for (const auto& instr : data.instructions) {
        os << "    " << instr << ",\n";
    }
    os << "  ],\n";
    os << "  calldata: [";
    for (size_t i = 0; i < data.calldata.size(); ++i) {
        os << data.calldata[i];
        if (i + 1 < data.calldata.size())
            os << ", ";
    }
    os << "]\n";
    os << "}";
    return os;
}
