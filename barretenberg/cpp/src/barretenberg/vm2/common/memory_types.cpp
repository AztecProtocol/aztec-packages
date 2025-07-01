#include "barretenberg/vm2/common/memory_types.hpp"

#include <cassert>
#include <stdexcept>

namespace bb::avm2 {

uint8_t integral_tag_length(MemoryTag tag)
{
    switch (tag) {
    case MemoryTag::U1:
    case MemoryTag::U8:
        return 1;
    case MemoryTag::U16:
        return 2;
    case MemoryTag::U32:
        return 4;
    case MemoryTag::U64:
        return 8;
    case MemoryTag::U128:
        return 16;
    case MemoryTag::FF:
        throw std::runtime_error("FF is not an integral tag");
    }

    assert(false && "This should not happen");
    return 0; // Should never happen. To please the compiler.
}

} // namespace bb::avm2
