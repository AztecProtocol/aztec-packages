#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

enum class AluOperation : uint8_t {
    ADD,
    SUB,
    MUL,
    DIV,
    FDIV,
    EQ,
    LT,
    LTE,
    NOT,
    SHL,
    SHR,
    TRUNCATE,
};

// Explanations on default values:
// Circuit values of execution.register[X], execution.mem_tag_reg[X] corresponding to the output c are all set to 0 when
// an error is thrown. In order to have a correct lookup from Execution into ALU, we therefore need to set the default
// values to 0. Note also that the default value for b allows to deduplicate events when only member `a` is being set
// (e.g. NOT with error). Otherwise, the key would not be deterministic.
// For a, the default constructor ensures that the value is not unitialized, but we always explicitly set it during
// event emission.
struct AluEvent {
    AluOperation operation = static_cast<AluOperation>(0);
    MemoryValue a;
    MemoryValue b = MemoryValue::from_tag(static_cast<ValueTag>(0), 0);
    MemoryValue c = MemoryValue::from_tag(static_cast<ValueTag>(0), 0);

    bool error = false;
    // To be used with deduplicating event emitters.
    using Key = std::tuple<AluOperation, MemoryValue, MemoryValue>;
    Key get_key() const { return { operation, a, b }; }

    bool operator==(const AluEvent& other) const = default;
};

} // namespace bb::avm2::simulation
