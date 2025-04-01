#include "barretenberg/vm2/tracegen/update_check_trace.hpp"

#include "barretenberg/vm/aztec_constants.hpp"

namespace bb::avm2::tracegen {

void UpdateCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::UpdateCheckEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;

    for (const auto& event : events) {
        FF update_hash_inv = event.update_hash == 0 ? 0 : event.update_hash.invert();

        bool blocknumber_is_lt_block_of_change = event.block_number < event.update_block_of_change;
        FF block_of_change_subtraction = blocknumber_is_lt_block_of_change
                                             ? (event.update_block_of_change - 1 - event.block_number)
                                             : (event.block_number - event.update_block_of_change);

        bool update_pre_class_is_zero = event.update_pre_class == 0;
        FF update_pre_class_inv = update_pre_class_is_zero ? 0 : event.update_pre_class.invert();

        bool update_post_class_is_zero = event.update_post_class == 0;
        FF update_post_class_inv = update_post_class_is_zero ? 0 : event.update_post_class.invert();

        trace.set(row,
                  { { { C::update_check_sel, 1 },
                      { C::update_check_address, event.address },
                      { C::update_check_current_class_id, event.current_class_id },
                      { C::update_check_original_class_id, event.original_class_id },
                      { C::update_check_public_data_tree_root, event.public_data_tree_root },
                      { C::update_check_blocknumber, event.block_number },
                      { C::update_check_update_hash, event.update_hash },
                      { C::update_check_update_hash, update_hash_inv },
                      { C::update_check_hash_not_zero, event.update_hash != 0 },
                      { C::update_check_update_delay, event.update_delay },
                      { C::update_check_update_pre_class, event.update_pre_class },
                      { C::update_check_update_post_class, event.update_post_class },
                      { C::update_check_update_block_of_change, event.update_block_of_change },
                      { C::update_check_updated_class_ids_slot, UPDATED_CLASS_IDS_SLOT },
                      { C::update_check_shared_mutable_slot, event.shared_mutable_slot },
                      { C::update_check_shared_mutable_hash_slot,
                        event.shared_mutable_slot + UPDATES_SHARED_MUTABLE_VALUES_LEN },
                      { C::update_check_public_leaf_index_domain_separator, GENERATOR_INDEX__PUBLIC_LEAF_INDEX },
                      { C::update_check_deployer_protocol_contract_address, DEPLOYER_CONTRACT_ADDRESS },
                      { C::update_check_shared_mutable_leaf_slot, event.shared_mutable_leaf_slot },
                      { C::update_check_blocknumber_is_lt_block_of_change, blocknumber_is_lt_block_of_change },
                      { C::update_check_block_of_change_subtraction, block_of_change_subtraction },
                      { C::update_check_blocknumber_bit_size, 32 },
                      { C::update_check_update_pre_class_is_zero, update_pre_class_is_zero },
                      { C::update_check_update_pre_class_inv, update_pre_class_inv },
                      { C::update_check_update_post_class_is_zero, update_post_class_is_zero },
                      { C::update_check_update_post_class_inv, update_post_class_inv } } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
