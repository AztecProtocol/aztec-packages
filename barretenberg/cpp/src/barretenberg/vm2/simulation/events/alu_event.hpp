#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/uint1.hpp"

namespace bb::avm2::simulation {

enum class AluOperation {
    ADD,
    LT,
    EQ,
    NOT,
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

// Explanations on default values for b and c:
// execution.register[X] == 0 and execution.mem_tag_reg[X] == 0 when we throw an error in execution, because
// in the trace the default value is 0.
// To have a correct lookup from Execution into ALU, we therefore need to set the default value to 0.
// Note also that the default value for b allows to deduplicate events with only a being set. Otherwise, the key would
// not be deterministic.
struct AluEvent {
    AluOperation operation;
    MemoryValue a;
    MemoryValue b = MemoryValue::from_tag(static_cast<ValueTag>(0),
                                          0); // Avoid unitialized values for ALU ops with one input such as NOT,
                                              // TRUNCATE. Otherwise, deduplication is not guaranteed.
    MemoryValue c = MemoryValue::from_tag(static_cast<ValueTag>(0),
                                          0); // Avoid unitialized values for ALU ops with one input and one output.
    std::optional<AluError> error;
    // To be used with deduplicating event emitters.
    using Key = std::tuple<AluOperation, MemoryValue, MemoryValue>;
    Key get_key() const { return { operation, a, b }; }

    bool operator==(const AluEvent& other) const = default;
};

} // namespace bb::avm2::simulation
