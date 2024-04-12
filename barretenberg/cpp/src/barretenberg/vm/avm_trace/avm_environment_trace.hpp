#pragma once

#include "avm_common.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include <cstdint>
#include <unordered_map>

inline const uint32_t SENDER_SELECTOR = 0;
inline const uint32_t ADDRESS_SELECTOR = 1;

namespace bb::avm_trace {
class AvmEnvironmentTraceBuilder {
  public:
    struct EnvironmentTraceEntry {
        // TODO: could be u8?
        uint32_t environment_selector = 0;
        bool q_environment_lookup = false;
    };

    std::vector<FF> kernel_inputs;

    // Counts the number of accesses into each SELECTOR for the environment selector lookups;
    std::unordered_map<uint32_t, uint32_t> environment_selector_counter;

    // TODO: should i have access to the kernel_inputs here -> so they can be directly looked up?
    AvmEnvironmentTraceBuilder(std::vector<FF> kernel_inputs);

    void reset();

    FF op_sender();
    FF op_address();

  private:
    std::vector<EnvironmentTraceEntry> environment_trace;
};
} // namespace bb::avm_trace