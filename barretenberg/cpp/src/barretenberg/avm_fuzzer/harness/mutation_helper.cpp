#include "mutation_helper.hpp"

#include <cassert>
#include <cstdint>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::fuzzing {

using bb::avm2::FF;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

MemoryValue read_mem_value(FuzzedDataProvider& fdp)
{
    // Grab 32 bytes for a uint256
    uint64_t limb0 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb1 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb2 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb3 = fdp.ConsumeIntegral<uint64_t>();

    uint256_t value = uint256_t(limb0, limb1, limb2, limb3);

    int tag_choice = fdp.ConsumeIntegralInRange<int>(0, 6);
    switch (tag_choice) {
    case 0:
        return MemoryValue::from_tag_truncating(MemoryTag::U1, FF(value));
        break;
    case 1:
        return MemoryValue::from_tag_truncating(MemoryTag::U8, FF(value));
        break;
    case 2:
        return MemoryValue::from_tag_truncating(MemoryTag::U16, FF(value));
        break;
    case 3:
        return MemoryValue::from_tag_truncating(MemoryTag::U32, FF(value));
        break;
    case 4:
        return MemoryValue::from_tag_truncating(MemoryTag::U64, FF(value));
        break;
    case 5:
        return MemoryValue::from_tag_truncating(MemoryTag::U128, FF(value));
        break;
    case 6:
        return MemoryValue::from_tag_truncating(MemoryTag::FF, FF(value));
        break;
    default:
        assert(false && "unreachable");
    }
    // To satisfy compiler
    return MemoryValue::from_tag_truncating(MemoryTag::FF, FF(0));
}

FF read_ff(FuzzedDataProvider& fdp)
{
    uint64_t limb0 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb1 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb2 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb3 = fdp.ConsumeIntegral<uint64_t>();
    return FF(limb0, limb1, limb2, limb3);
}

} // namespace bb::avm2::fuzzing
