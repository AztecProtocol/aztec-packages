#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct EccException : public std::runtime_error {
    EccException(const std::string& message)
        : std::runtime_error("EccException: " + message)
    {}
};

struct EccAddEvent {
    EmbeddedCurvePoint p;
    EmbeddedCurvePoint q;
    EmbeddedCurvePoint result;
};

struct EccAddMemoryEvent {
    uint32_t execution_clk;
    uint16_t space_id;
    EmbeddedCurvePoint p;
    EmbeddedCurvePoint q;
    EmbeddedCurvePoint result;
    MemoryAddress dst_address;
};

struct ScalarMulIntermediateState {
    /* Accumulated result on this bit of the scalar */
    EmbeddedCurvePoint res;
    /* 2**(bit_idx) * point */
    EmbeddedCurvePoint temp;
    /* current bit of the scalar */
    bool bit;

    bool operator==(const ScalarMulIntermediateState& other) const = default;
};

struct ScalarMulEvent {
    EmbeddedCurvePoint point;
    FF scalar;
    std::vector<ScalarMulIntermediateState> intermediate_states;
    EmbeddedCurvePoint result;

    bool operator==(const ScalarMulEvent& other) const = default;
};

} // namespace bb::avm2::simulation
