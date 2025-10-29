#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/serialize/msgpack.hpp"

/// @brief describes the data which will be used for fuzzing
/// Should contain instructions, calldata, CFG instructions, options to disable/enable instructions, etc
struct FuzzerData {
    std::vector<std::vector<FuzzInstruction>> instruction_blocks;
    std::vector<CFGInstruction> cfg_instructions;
    std::vector<bb::avm2::FF> calldata;
    ReturnOptions return_options;
    MSGPACK_FIELDS(instruction_blocks, cfg_instructions, calldata, return_options);
};

#include <iostream>

inline std::ostream& operator<<(std::ostream& os, const FuzzerData& data)
{
    os << "FuzzerData {\n";
    os << "  instructions: [\n";
    for (const auto& block : data.instruction_blocks) {
        os << "    [\n";
        for (const auto& instr : block) {
            os << "      " << instr << ",\n";
        }
        os << "    ],\n";
    }
    os << "  ],\n";
    os << "  cfg_instructions: [\n";
    for (const auto& instr : data.cfg_instructions) {
        os << "    " << instr << ",\n";
    }
    os << "  ],\n";
    os << "  calldata: [";
    for (size_t i = 0; i < data.calldata.size(); ++i) {
        os << data.calldata[i];
        if (i + 1 < data.calldata.size()) {
            os << ", ";
        }
    }
    os << "],\n";
    os << "  return_options: " << "tag: " << data.return_options.return_value_tag
       << ", offset: " << data.return_options.return_value_offset_index << ",\n";
    os << "}";
    return os;
}
