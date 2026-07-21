#include "barretenberg/vm2/tracegen/update_check_trace.hpp"

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_update_check.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Process the UpdateCheck events and populate the relevant columns in the trace.
 *
 * Events are emitted in the following flavors:
 * - Hash is zero (never updated): preimage fields (metadata, pre_class_id, post_class_id) are all zero;
 *   hash_not_zero is false and most conditional columns are inactive.
 * - Hash is nonzero (update exists): all fields are populated; metadata is decomposed into
 *   update_hi_metadata and timestamp_of_change, and the pre/post class ID zero flags are derived.
 *
 * @param events Container of UpdateCheckEvent to process.
 * @param trace The trace container to populate.
 */
void UpdateCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::UpdateCheckEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;

    for (const auto& event : events) {
        uint256_t update_metadata = static_cast<uint256_t>(event.update_preimage_metadata);
        uint256_t update_metadata_hi = update_metadata >> TIMESTAMP_OF_CHANGE_BIT_SIZE;

        // Note that the code below no longer works after 2106 as by that time the timestamp will overflow u32. The 64
        // bit timestamp being packed in 32 bits is a tech debt that is not worth tackling.
        uint64_t timestamp_of_change = static_cast<uint64_t>(static_cast<uint32_t>(update_metadata & 0xffffffff));

        bool hash_not_zero = event.update_hash != 0;
        bool timestamp_is_lt_timestamp_of_change = event.current_timestamp < timestamp_of_change;
        bool update_pre_class_id_is_zero = event.update_preimage_pre_class_id == 0;
        bool update_post_class_id_is_zero = event.update_preimage_post_class_id == 0;

        trace.set(
            row,
            { {
                { C::update_check_sel, 1 },
                { C::update_check_const_three, 3 },
                { C::update_check_address, event.address },
                { C::update_check_current_class_id, event.current_class_id },
                { C::update_check_original_class_id, event.original_class_id },
                { C::update_check_public_data_tree_root, event.public_data_tree_root },
                { C::update_check_timestamp, event.current_timestamp },
                { C::update_check_timestamp_pi_offset, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX },
                { C::update_check_update_hash, event.update_hash },
                { C::update_check_update_hash_inv, event.update_hash }, // Will be inverted in batch later
                { C::update_check_hash_not_zero, hash_not_zero },
                { C::update_check_update_preimage_metadata, event.update_preimage_metadata },
                { C::update_check_update_preimage_pre_class_id, event.update_preimage_pre_class_id },
                { C::update_check_update_preimage_post_class_id, event.update_preimage_post_class_id },
                { C::update_check_updated_class_ids_slot, UPDATED_CLASS_IDS_SLOT },
                { C::update_check_dom_sep_public_storage_map_slot, DOM_SEP__PUBLIC_STORAGE_MAP_SLOT },
                { C::update_check_delayed_public_mutable_slot, event.delayed_public_mutable_slot },
                { C::update_check_delayed_public_mutable_hash_slot,
                  event.delayed_public_mutable_slot + UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN },
                { C::update_check_contract_instance_registry_address, CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS },
                { C::update_check_timestamp_of_change, timestamp_of_change },
                { C::update_check_update_hi_metadata, update_metadata_hi },
                { C::update_check_update_hi_metadata_bit_size,
                  UPDATES_DELAYED_PUBLIC_MUTABLE_METADATA_BIT_SIZE - TIMESTAMP_OF_CHANGE_BIT_SIZE },
                { C::update_check_timestamp_of_change_bit_size, TIMESTAMP_OF_CHANGE_BIT_SIZE },
                { C::update_check_timestamp_is_lt_timestamp_of_change, timestamp_is_lt_timestamp_of_change },
                { C::update_check_update_pre_class_id_is_zero, update_pre_class_id_is_zero },
                { C::update_check_update_pre_class_inv,
                  event.update_preimage_pre_class_id }, // Will be inverted in batch later
                { C::update_check_update_post_class_id_is_zero, update_post_class_id_is_zero },
                { C::update_check_update_post_class_inv,
                  event.update_preimage_post_class_id }, // Will be inverted in batch later
            } });
        row++;
    }

    // Batch invert the columns.
    trace.invert_columns({ {
        C::update_check_update_hash_inv,
        C::update_check_update_pre_class_inv,
        C::update_check_update_post_class_inv,
    } });
}

const InteractionDefinition UpdateCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupIntoIndexedByRow, lookup_update_check_timestamp_from_public_inputs_settings>()
        .add<InteractionType::LookupSequential, lookup_update_check_update_hash_poseidon2_settings>()
        .add<InteractionType::LookupSequential, lookup_update_check_delayed_public_mutable_slot_poseidon2_settings>()
        .add<InteractionType::LookupGeneric, lookup_update_check_update_hash_public_data_read_settings>()
        .add<InteractionType::LookupGeneric, lookup_update_check_update_hi_metadata_range_settings>()
        .add<InteractionType::LookupGeneric, lookup_update_check_update_lo_metadata_range_settings>()
        .add<InteractionType::LookupGeneric, lookup_update_check_timestamp_is_lt_timestamp_of_change_settings>(
            Column::gt_sel);

} // namespace bb::avm2::tracegen
