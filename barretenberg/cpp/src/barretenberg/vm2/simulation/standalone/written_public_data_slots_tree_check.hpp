#pragma once

#include <stack>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/set.hpp"
#include "barretenberg/vm2/simulation/interfaces/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"

namespace bb::avm2::simulation {

// Forward declaration.
class Poseidon2Interface;

class PureWrittenPublicDataSlotsTreeCheck : public WrittenPublicDataSlotsTreeCheckInterface {
  public:
    PureWrittenPublicDataSlotsTreeCheck(Poseidon2Interface& poseidon2)
        : poseidon2(poseidon2)
    {
        // Start empty.
        written_public_data_slots_stack.push({});
    }

    bool contains(const AztecAddress& contract_address, const FF& slot) override;
    void insert(const AztecAddress& contract_address, const FF& slot) override;
    AppendOnlyTreeSnapshot get_snapshot() const override;
    uint32_t size() const override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

  private:
    Poseidon2Interface& poseidon2;

    using WrittenSlotsSet = unordered_flat_set<FF>;
    std::stack<WrittenSlotsSet> written_public_data_slots_stack;

    FF compute_leaf_slot(const AztecAddress& contract_address, const FF& slot);
};

} // namespace bb::avm2::simulation
