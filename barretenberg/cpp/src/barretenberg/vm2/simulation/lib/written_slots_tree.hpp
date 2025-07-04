#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/indexed_memory_tree.hpp"

namespace bb::avm2::simulation {

struct WrittenPublicDataSlotLeafValue {
    FF slot;

    WrittenPublicDataSlotLeafValue(const FF& slot)
        : slot(slot)
    {}

    static bool is_updateable() { return true; }

    bool operator==(WrittenPublicDataSlotLeafValue const& other) const { return slot == other.slot; }

    friend std::ostream& operator<<(std::ostream& os, const WrittenPublicDataSlotLeafValue& v)
    {
        os << "slot = " << v.slot;
        return os;
    }

    fr get_key() const { return slot; }

    bool is_empty() const { return slot.is_zero(); }

    std::vector<fr> get_hash_inputs(fr nextKey, fr nextIndex) const
    {
        return std::vector<fr>({ slot, nextKey, nextIndex });
    }

    operator uint256_t() const { return get_key(); }

    static WrittenPublicDataSlotLeafValue empty() { return { fr::zero() }; }

    static WrittenPublicDataSlotLeafValue padding(index_t i) { return { i }; }

    static std::string name() { return "WrittenPublicDataSlotLeafValue"; };
};

using WrittenPublicDataSlotsTree = IndexedMemoryTree<WrittenPublicDataSlotLeafValue, Poseidon2HashPolicy>;

using WrittenPublicDataSlotsTreeLeafPreimage = IndexedLeaf<WrittenPublicDataSlotLeafValue>;

inline WrittenPublicDataSlotsTree build_public_data_slots_tree()
{
    return WrittenPublicDataSlotsTree(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT,
                                      AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE);
}

} // namespace bb::avm2::simulation
