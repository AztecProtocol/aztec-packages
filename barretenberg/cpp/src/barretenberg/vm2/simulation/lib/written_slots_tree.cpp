#include "written_slots_tree.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2::simulation {

bool WrittenPublicDataSlotLeafValue::is_updateable()
{
    return true;
}

bool WrittenPublicDataSlotLeafValue::operator==(WrittenPublicDataSlotLeafValue const& other) const
{
    return slot == other.slot;
}

std::ostream& operator<<(std::ostream& os, const WrittenPublicDataSlotLeafValue& v)
{
    os << "slot = " << v.slot;
    return os;
}

fr WrittenPublicDataSlotLeafValue::get_key() const
{
    return slot;
}

bool WrittenPublicDataSlotLeafValue::is_empty() const
{
    return slot.is_zero();
}

std::vector<fr> WrittenPublicDataSlotLeafValue::get_hash_inputs(fr nextKey, fr nextIndex) const
{
    return std::vector<fr>({ slot, nextKey, nextIndex });
}

WrittenPublicDataSlotLeafValue::operator uint256_t() const
{
    return get_key();
}

WrittenPublicDataSlotLeafValue WrittenPublicDataSlotLeafValue::empty()
{
    return { fr::zero() };
}

WrittenPublicDataSlotLeafValue WrittenPublicDataSlotLeafValue::padding(index_t i)
{
    return { i };
}

std::string WrittenPublicDataSlotLeafValue::name()
{
    return "WrittenPublicDataSlotLeafValue";
}

WrittenPublicDataSlotsTree build_public_data_slots_tree()
{
    return WrittenPublicDataSlotsTree(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT,
                                      AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE);
}

} // namespace bb::avm2::simulation
