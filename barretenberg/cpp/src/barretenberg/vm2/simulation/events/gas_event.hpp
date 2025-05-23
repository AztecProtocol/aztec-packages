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

enum class GasPhase {
    BASE,
    DYNAMIC,
};

enum class GasDimension {
    L2,
    DA,
};

inline std::string to_string(GasPhase e)
{
    switch (e) {
    case GasPhase::BASE:
        return "BASE_GAS";
    case GasPhase::DYNAMIC:
        return "DYNAMIC_GAS";
    }

    // Only to please the compiler.
    return "UNKNOWN_GAS_PHASE";
}

inline std::string to_string(GasDimension e)
{
    switch (e) {
    case GasDimension::L2:
        return "L2";
    case GasDimension::DA:
        return "DA";
    }

    // Only to please the compiler.
    return "UNKNOWN_GAS_DIMENSION";
}

struct OutOfGasException : public std::runtime_error {
    explicit OutOfGasException(GasPhase phase, GasDimension dimension)
        : std::runtime_error("Out of gas: " + to_string(phase) + " " + to_string(dimension))
        , phase(phase)
        , dimension(dimension)
    {}
    GasPhase phase;
    GasDimension dimension;
};

struct GasEvent {
    uint32_t opcode_gas = 0;
    uint32_t addressing_gas = 0;
    Gas base_gas = { 0, 0 };

    Gas dynamic_gas_factor = { 0, 0 };
    Gas dynamic_gas = { 0, 0 };

    bool oog_l2_base = false;
    bool oog_da_base = false;

    bool oog_l2_dynamic = false;
    bool oog_da_dynamic = false;

    bool operator==(const GasEvent& other) const = default;
};

} // namespace bb::avm2::simulation
