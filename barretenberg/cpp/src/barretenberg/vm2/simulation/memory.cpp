#include "barretenberg/vm2/simulation/memory.hpp"

#include <cstdint>
#include <memory>

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

bool MemoryInterface::is_valid_address(const MemoryValue& address)
{
    (void)address;
    return true;
    // This is failing and I don't know why.
    // return address < static_cast<uint64_t>(0x100000000); // 2^32
}

bool MemoryInterface::is_valid_address(ValueRefAndTag address)
{
    return is_valid_address(address.value) && address.tag == MemoryAddressTag;
}

void Memory::set(MemoryAddress index, std::unique_ptr<AvmTaggedMemoryWrapper> tagged_value)
{
    // TODO: validate tag-value makes sense.
    events.emit({ .mode = MemoryMode::WRITE,
                  .addr = index,
                  .value = tagged_value->get_memory_value(),
                  .tag = tagged_value->get_tag()

                      ,
                  .space_id = space_id });
    debug("Memory write: ",
          index,
          " <- ",
          tagged_value->get_memory_value(),
          " (tag: ",
          static_cast<int>(tagged_value->get_tag()),
          ")");
    memory[index] = std::move(tagged_value);
}

AvmTaggedMemoryWrapper& Memory::get(MemoryAddress index) const
{
    static const auto default_value =
        std::make_unique<AvmTaggedMemoryWrapper>(std::make_unique<AvmFieldType>(uint256_t(0)));

    auto it = memory.find(index);
    const auto& vt = it != memory.end() ? it->second : default_value;
    events.emit({ .mode = MemoryMode::READ,
                  .addr = index,
                  .value = vt->get_memory_value(),
                  .tag = vt->get_tag(),
                  .space_id = space_id });

    debug("Memory read: ", index, " -> ", vt->get_memory_value(), " (tag: ", static_cast<int>(vt->get_tag()), ")");
    return *vt;
}

} // namespace bb::avm2::simulation
