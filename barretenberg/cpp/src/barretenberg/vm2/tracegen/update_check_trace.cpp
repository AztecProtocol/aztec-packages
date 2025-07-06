#include "barretenberg/vm2/tracegen/update_check_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_update_check.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void UpdateCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::UpdateCheckEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;

    for (const auto& event : events) {
        uint256_t update_metadata = static_cast<uint256_t>(event.update_preimage_metadata);
        uint256_t update_metadata_hi = update_metadata >> 32;

        // Note that the code below no longer works after 2106 as by that time the timestamp will overflow u32. The 64
        // bit timestamp being packed in 32 bits is a tech debt that is not worth tackling.
        uint64_t timestamp_of_change = static_cast<uint64_t>(static_cast<uint32_t>(update_metadata & 0xffffffff));

        bool timestamp_is_lt_timestamp_of_change = event.current_timestamp < timestamp_of_change;

        FF update_hash_inv = event.update_hash == 0 ? 0 : event.update_hash.invert();

        FF timestamp_of_change_subtraction = timestamp_is_lt_timestamp_of_change
                                                 ? (timestamp_of_change - 1 - event.current_timestamp)
                                                 : (event.current_timestamp - timestamp_of_change);

        bool update_pre_class_id_is_zero = event.update_preimage_pre_class_id == 0;
        FF update_pre_class_inv = update_pre_class_id_is_zero ? 0 : event.update_preimage_pre_class_id.invert();

        bool update_post_class_id_is_zero = event.update_preimage_post_class_id == 0;
        FF update_post_class_inv = update_post_class_id_is_zero ? 0 : event.update_preimage_post_class_id.invert();

        trace.set(row,
                  { { { C::update_check_sel, 1 },
                      { C::update_check_address, event.address },
                      { C::update_check_current_class_id, event.current_class_id },
                      { C::update_check_original_class_id, event.original_class_id },
                      { C::update_check_public_data_tree_root, event.public_data_tree_root },
                      { C::update_check_timestamp, event.current_timestamp },
                      { C::update_check_update_hash, event.update_hash },
                      { C::update_check_update_hash_inv, update_hash_inv },
                      { C::update_check_hash_not_zero, event.update_hash != 0 },
                      { C::update_check_update_preimage_metadata, event.update_preimage_metadata },
                      { C::update_check_update_preimage_pre_class_id, event.update_preimage_pre_class_id },
                      { C::update_check_update_preimage_post_class_id, event.update_preimage_post_class_id },
                      { C::update_check_updated_class_ids_slot, UPDATED_CLASS_IDS_SLOT },
                      { C::update_check_delayed_public_mutable_slot, event.delayed_public_mutable_slot },
                      { C::update_check_delayed_public_mutable_hash_slot,
                        event.delayed_public_mutable_slot + UPDATES_SHARED_MUTABLE_VALUES_LEN },
                      { C::update_check_public_leaf_index_domain_separator, GENERATOR_INDEX__PUBLIC_LEAF_INDEX },
                      { C::update_check_deployer_protocol_contract_address, DEPLOYER_CONTRACT_ADDRESS },
                      { C::update_check_timestamp_of_change, timestamp_of_change },
                      { C::update_check_update_hi_metadata, update_metadata_hi },
                      { C::update_check_update_hi_metadata_bit_size,
                        UPDATES_SHARED_MUTABLE_METADATA_BIT_SIZE - TIMESTAMP_OF_CHANGE_BIT_SIZE },
                      { C::update_check_timestamp_of_change_bit_size, TIMESTAMP_OF_CHANGE_BIT_SIZE },
                      { C::update_check_timestamp_is_lt_timestamp_of_change, timestamp_is_lt_timestamp_of_change },
                      { C::update_check_timestamp_of_change_subtraction, timestamp_of_change_subtraction },
                      { C::update_check_update_pre_class_id_is_zero, update_pre_class_id_is_zero },
                      { C::update_check_update_pre_class_inv, update_pre_class_inv },
                      { C::update_check_update_post_class_id_is_zero, update_post_class_id_is_zero },
                      { C::update_check_update_post_class_inv, update_post_class_inv } } });
        row++;
    }
}

const InteractionDefinition UpdateCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_update_check_update_hash_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_update_check_delayed_public_mutable_slot_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_update_check_update_hash_public_data_read_settings, InteractionType::LookupSequential>()
        .add<lookup_update_check_update_hi_metadata_range_settings, InteractionType::LookupGeneric>()
        .add<lookup_update_check_update_lo_metadata_range_settings, InteractionType::LookupGeneric>()
        .add<lookup_update_check_timestamp_of_change_cmp_range_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
