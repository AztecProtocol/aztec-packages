#pragma once

#include "barretenberg/vm/avm/trace/common.hpp"

#include <array>
#include <cstdint>
#include <vector>

namespace bb::avm_trace {

constexpr uint32_t KECCAKF1600_INPUT_SIZE = 25;

class AvmKeccakTraceBuilder {
  public:
    struct KeccakTraceEntry {
        uint32_t clk = 0;
        std::vector<uint64_t> input;
        std::vector<uint64_t> output;
        uint32_t input_size = 0;
        uint32_t output_size = 0;
    };

    AvmKeccakTraceBuilder() = default;
    void reset();
    // Finalize the trace
    std::vector<KeccakTraceEntry> finalize();

    std::array<uint64_t, KECCAKF1600_INPUT_SIZE> keccakf1600(uint32_t clk,
                                                             std::array<uint64_t, KECCAKF1600_INPUT_SIZE> input);

  private:
    std::vector<KeccakTraceEntry> keccak_trace;
};

} // namespace bb::avm_trace
