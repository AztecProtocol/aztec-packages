#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

enum class AluOperation {
    ADD,
};

// TODO(MW): Expand when adding new ops (e.g. when using max_bits for mul, we would cover bits related errors)
enum class AluError {
    // TODO(MW): Split into cases i.e. ab tags not equal, c tag not as expected, ..., ?
    TAG_ERROR,
};

inline std::string to_string(AluError e)
{
    switch (e) {
    case AluError::TAG_ERROR:
        return "TAG_ERROR";
    }

    // We should be catching all the cases above.
    __builtin_unreachable();
}

class AluException : public std::runtime_error {
  public:
    explicit AluException()
        : std::runtime_error("ALU operation failed")
    {}
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
