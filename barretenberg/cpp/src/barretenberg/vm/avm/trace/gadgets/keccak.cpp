#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/crypto/hashers/hashers.hpp"
#include "barretenberg/vm/avm/trace/gadgets/keccak.hpp"

#include <algorithm>
#include <cstdint>

namespace bb::avm_trace {

std::vector<AvmKeccakTraceBuilder::KeccakTraceEntry> AvmKeccakTraceBuilder::finalize()
{
    return std::move(keccak_trace);
}

void AvmKeccakTraceBuilder::reset()
{
    keccak_trace.clear();
    keccak_trace.shrink_to_fit(); // Reclaim memory.
}

std::array<uint64_t, 25> AvmKeccakTraceBuilder::keccakf1600(uint32_t clk, std::array<uint64_t, 25> input)
{
    // BB's Eth hash function uses C-style arrays, while we like to use std::array
    // We do a few conversions for here but maybe we will update later.
    uint64_t state[25] = {};
    std::copy(input.begin(), input.end(), state);
    std::vector<uint64_t> input_vector(input.begin(), input.end());
    // This function mutates state
    ethash_keccakf1600(state);
    std::array<uint64_t, 25> output = {};
    for (size_t i = 0; i < 25; i++) {
        output[i] = state[i];
    }
    std::vector<uint64_t> output_vector(output.begin(), output.end());
    keccak_trace.push_back(KeccakTraceEntry{
        .clk = clk,
        .input = input_vector,
        .output = output_vector,
        .input_size = 25,
        .output_size = 25,
    });
    return output;
}

} // namespace bb::avm_trace
