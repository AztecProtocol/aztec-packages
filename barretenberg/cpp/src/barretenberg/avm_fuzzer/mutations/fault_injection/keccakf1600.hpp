#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

namespace detail {

inline void mutate_keccak_round_data(simulation::KeccakF1600RoundData& round, std::mt19937_64& rng)
{
    auto value = static_cast<uint64_t>(rng());
    auto idx = std::uniform_int_distribution<size_t>(0, 4)(rng);
    auto idy = std::uniform_int_distribution<size_t>(0, 4)(rng);
    switch (std::uniform_int_distribution<uint8_t>(0, 6)(rng)) {
    case 0:
        round.state[idx][idy] ^= value;
        break;
    case 1:
        round.state_theta[idx][idy] ^= value;
        break;
    case 2:
        round.state_rho[idx][idy] ^= value;
        break;
    case 3:
        round.state_pi_not[idx][idy] ^= value;
        break;
    case 4:
        round.state_pi_and[idx][idy] ^= value;
        break;
    case 5:
        round.state_chi[idx][idy] ^= value;
        break;
    case 6:
        round.state_iota_00 ^= value;
        break;
    default:
        break;
    }
}

} // namespace detail

inline void fault_injection_keccakf1600(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.keccakf1600.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.keccakf1600.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_KECCAKF1600_EVENT_CONFIGURATION.select(rng);
    auto& event = events.keccakf1600[index];
    switch (mutation) {
    case FaultInjectionKeccakF1600EventOptions::SrcMemValue: {
        auto element = std::uniform_int_distribution<size_t>(0, event.src_mem_values.size() - 1)(rng);
        event.src_mem_values[element] = mutate_memory_value(event.src_mem_values[element], rng);
        break;
    }
    case FaultInjectionKeccakF1600EventOptions::SrcAddr:
        mutate_uint32_t(event.src_addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionKeccakF1600EventOptions::DstAddr:
        mutate_uint32_t(event.dst_addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionKeccakF1600EventOptions::SpaceId:
        mutate_uint16_t(event.space_id, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionKeccakF1600EventOptions::ExecutionClk:
        mutate_uint32_t(event.execution_clk, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionKeccakF1600EventOptions::Flags:
        switch (std::uniform_int_distribution<uint8_t>(0, 2)(rng)) {
        case 0:
            event.dst_out_of_range = !event.dst_out_of_range;
            break;
        case 1:
            event.src_out_of_range = !event.src_out_of_range;
            break;
        case 2:
            event.tag_error = !event.tag_error;
            break;
        default:
            break;
        }
        break;
    case FaultInjectionKeccakF1600EventOptions::RoundData: {
        auto round = std::uniform_int_distribution<size_t>(0, event.rounds.size() - 1)(rng);
        detail::mutate_keccak_round_data(event.rounds[round], rng);
        break;
    }
    }
}

} // namespace bb::avm2::fuzzer
