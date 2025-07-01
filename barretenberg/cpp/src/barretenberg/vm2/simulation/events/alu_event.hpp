#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

enum class AluOperation {
    ADD,
    LT,
};

// TODO(MW): Expand when adding new ops (e.g. when using max_bits for mul, we would cover bits related errors)
enum class AluError {
    // TODO(MW): Split into cases i.e. ab tags not equal, c tag not as expected, ..., ?
    TAG_ERROR,
};

struct AluEvent {
    AluOperation operation;
    MemoryValue a;
    MemoryValue b;
    MemoryValue c;
    std::optional<AluError> error;
    // To be used with deduplicating event emitters.
    using Key = std::tuple<AluOperation, MemoryValue, MemoryValue>;
    Key get_key() const { return { operation, a, b }; }

    bool operator==(const AluEvent& other) const = default;
};

} // namespace bb::avm2::simulation
