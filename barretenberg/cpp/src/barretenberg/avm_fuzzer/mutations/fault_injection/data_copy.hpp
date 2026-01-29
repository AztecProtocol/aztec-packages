#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

inline void fault_injection_data_copy(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.data_copy_events.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.data_copy_events.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_DATA_COPY_EVENT_CONFIGURATION.select(rng);
    auto& event = events.data_copy_events[index];
    switch (mutation) {
    case FaultInjectionDataCopyEventOptions::CopyingData: {
        if (event.copying_data.empty()) {
            return;
        }
        auto element = std::uniform_int_distribution<size_t>(0, event.copying_data.size() - 1)(rng);
        event.copying_data[element] = mutate_memory_value(event.copying_data[element], rng);
        break;
    }
    case FaultInjectionDataCopyEventOptions::Operation:
        event.operation = event.operation == simulation::DataCopyOperation::CD_COPY
                              ? simulation::DataCopyOperation::RD_COPY
                              : simulation::DataCopyOperation::CD_COPY;
        break;
    case FaultInjectionDataCopyEventOptions::WriteContextId:
        mutate_uint32_t(event.write_context_id, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionDataCopyEventOptions::ReadContextId:
        mutate_uint32_t(event.read_context_id, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionDataCopyEventOptions::DataCopySize:
        mutate_uint32_t(event.data_copy_size, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionDataCopyEventOptions::DataOffset:
        mutate_uint32_t(event.data_offset, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionDataCopyEventOptions::SrcDataAddr:
        mutate_uint32_t(event.src_data_addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionDataCopyEventOptions::SrcDataSize:
        mutate_uint32_t(event.src_data_size, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionDataCopyEventOptions::DstAddr:
        mutate_uint32_t(event.dst_addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionDataCopyEventOptions::IsNested:
        event.is_nested = !event.is_nested;
        break;
    case FaultInjectionDataCopyEventOptions::ExecutionClk:
        mutate_uint32_t(event.execution_clk, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    }
}

} // namespace bb::avm2::fuzzer
