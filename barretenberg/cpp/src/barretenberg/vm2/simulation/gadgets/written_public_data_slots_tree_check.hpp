#pragma once

#include <cstdint>
#include <stack>
#include <utility>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"

namespace bb::avm2::simulation {

class WrittenPublicDataSlotsTreeCheck : public WrittenPublicDataSlotsTreeCheckInterface {
  public:
    WrittenPublicDataSlotsTreeCheck(IndexedTreeCheckInterface& indexed_tree_check,
                                    WrittenPublicDataSlotsTree initial_state)
        : indexed_tree_check(indexed_tree_check)
    {
        written_public_data_slots_tree_stack.push(std::move(initial_state));
    }

    bool contains(const AztecAddress& contract_address, const FF& slot) override;

    void insert(const AztecAddress& contract_address, const FF& slot) override;

    AppendOnlyTreeSnapshot get_snapshot() const override;

    uint32_t size() const override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

  private:
    IndexedTreeCheckInterface& indexed_tree_check;

    std::stack<WrittenPublicDataSlotsTree> written_public_data_slots_tree_stack = {};
};

} // namespace bb::avm2::simulation
