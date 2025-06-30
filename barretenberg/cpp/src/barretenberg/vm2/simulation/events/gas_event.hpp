#pragma once

#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

struct OutOfGasException : public std::runtime_error {
    explicit OutOfGasException(const std::string& message)
        : std::runtime_error(message)
    {}
};

struct GasEvent {
    uint32_t addressing_gas = 0;

    Gas dynamic_gas_factor = { 0, 0 };

    uint64_t limit_used_l2_comparison_witness;
    uint64_t limit_used_da_comparison_witness;

    bool oog_base_l2 = false;
    bool oog_base_da = false;

    bool oog_dynamic_l2 = false;
    bool oog_dynamic_da = false;

    bool operator==(const GasEvent& other) const = default;
};

} // namespace bb::avm2::simulation
