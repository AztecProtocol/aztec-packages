#pragma once

#include "avm_common.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "constants.hpp"
#include <cstdint>
#include <unordered_map>

inline const uint32_t SENDER_SELECTOR = 0;
inline const uint32_t ADDRESS_SELECTOR = 1;
inline const uint32_t PORTAL_SELECTOR = 2;
inline const uint32_t FUNCTION_SELECTOR = 3;
// TODO: double check that these indexes are correct
inline const uint32_t FEE_PER_DA_GAS_SELECTOR = 9;
inline const uint32_t FEE_PER_L1_GAS_SELECTOR = 11;
inline const uint32_t FEE_PER_L2_GAS_SELECTOR = 13;

const std::array<uint32_t, 7> KERNEL_INPUTS_SELECTORS = { SENDER_SELECTOR,         ADDRESS_SELECTOR,
                                                          PORTAL_SELECTOR,         FUNCTION_SELECTOR,
                                                          FEE_PER_DA_GAS_SELECTOR, FEE_PER_L1_GAS_SELECTOR,
                                                          FEE_PER_L2_GAS_SELECTOR };

namespace bb::avm_trace {

class AvmKernelTraceBuilder {
  public:
    struct KernelTraceEntry {
        // TODO: could be u8?
        uint32_t kernel_selector = 0;
        bool q_kernel_lookup = false;
    };

    std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs{};

    // Counts the number of accesses into each SELECTOR for the environment selector lookups;
    std::unordered_map<uint32_t, uint32_t> kernel_selector_counter;

    // TODO: should i have access to the kernel_inputs here -> so they can be directly looked up?
    AvmKernelTraceBuilder(std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs);

    void reset();

    FF op_sender();
    FF op_address();
    FF op_portal();
    FF op_function();
    FF op_fee_per_da_gas();
    FF op_fee_per_l1_gas();
    FF op_fee_per_l2_gas();

  private:
    std::vector<KernelTraceEntry> kernel_trace;

    FF perform_kernel_lookup(uint32_t selector);
};
} // namespace bb::avm_trace