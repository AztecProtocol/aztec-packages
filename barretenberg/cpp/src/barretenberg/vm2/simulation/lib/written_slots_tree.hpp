#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/indexed_memory_tree.hpp"

namespace bb::avm2::simulation {

// Implements the methods expected by indexed_leaf.hpp
struct WrittenPublicDataSlotLeafValue {
    FF slot;

    WrittenPublicDataSlotLeafValue(const FF& slot)
        : slot(slot)
    {}

    static bool is_updateable();

    bool operator==(WrittenPublicDataSlotLeafValue const& other) const;

    friend std::ostream& operator<<(std::ostream& os, const WrittenPublicDataSlotLeafValue& v);

    fr get_key() const;

    bool is_empty() const;

    std::vector<fr> get_hash_inputs(fr nextKey, fr nextIndex) const;

    operator uint256_t() const;

    static WrittenPublicDataSlotLeafValue empty();

    static WrittenPublicDataSlotLeafValue padding(index_t i);

    static std::string name();
};

using WrittenPublicDataSlotsTree = IndexedMemoryTree<WrittenPublicDataSlotLeafValue, Poseidon2HashPolicy>;

using WrittenPublicDataSlotsTreeLeafPreimage = IndexedLeaf<WrittenPublicDataSlotLeafValue>;

WrittenPublicDataSlotsTree build_public_data_slots_tree();

} // namespace bb::avm2::simulation
