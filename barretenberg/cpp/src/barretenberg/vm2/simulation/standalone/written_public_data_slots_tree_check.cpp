#include "barretenberg/vm2/simulation/standalone/written_public_data_slots_tree_check.hpp"

#include "barretenberg/vm2/simulation/interfaces/poseidon2.hpp"

namespace bb::avm2::simulation {

FF PureWrittenPublicDataSlotsTreeCheck::compute_leaf_slot(const AztecAddress& contract_address, const FF& slot)
{
    return poseidon2.hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, slot });
}

bool PureWrittenPublicDataSlotsTreeCheck::contains(const AztecAddress& contract_address, const FF& slot)
{
    FF leaf_slot = compute_leaf_slot(contract_address, slot);
    const auto& set = written_public_data_slots_stack.top();
    return set.contains(leaf_slot);
}

void PureWrittenPublicDataSlotsTreeCheck::insert(const AztecAddress& contract_address, const FF& slot)
{
    FF leaf_slot = compute_leaf_slot(contract_address, slot);
    auto& set = written_public_data_slots_stack.top();
    set.insert(leaf_slot);
}

AppendOnlyTreeSnapshot PureWrittenPublicDataSlotsTreeCheck::get_snapshot() const
{
    // FIXME(fcarreiro): This shouldnt be in the interface.
    return AppendOnlyTreeSnapshot();
}

uint32_t PureWrittenPublicDataSlotsTreeCheck::size() const
{
    // FIXME(fcarreiro): This shouldnt be in the interface.
    return 0;
}

void PureWrittenPublicDataSlotsTreeCheck::create_checkpoint()
{
    WrittenSlotsSet current_set = written_public_data_slots_stack.top();
    written_public_data_slots_stack.push(current_set);
}

void PureWrittenPublicDataSlotsTreeCheck::commit_checkpoint()
{
    // Commit the current top of the stack down one level.
    WrittenSlotsSet current_set = written_public_data_slots_stack.top();
    written_public_data_slots_stack.pop();
    written_public_data_slots_stack.top() = std::move(current_set);
}

void PureWrittenPublicDataSlotsTreeCheck::revert_checkpoint()
{
    written_public_data_slots_stack.pop();
}

} // namespace bb::avm2::simulation
