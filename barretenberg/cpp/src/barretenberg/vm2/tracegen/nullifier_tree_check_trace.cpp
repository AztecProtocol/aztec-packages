#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_check.hpp"
#include "barretenberg/vm2/generated/relations/lookups_update_check.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using simulation::NullifierTreeLeafPreimage;

void NullifierTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::NullifierTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    auto reverted_in = compute_reverted_in_map(events);

    uint32_t row = 0;
    bool discard = false;
    std::optional<size_t> waiting_for_revert = std::nullopt;

    for (size_t i = 0; i < events.size(); i++) {
        const auto& event = events.at(i);
        if (std::holds_alternative<simulation::CheckPointEventType>(event)) {
            auto check_point_event = std::get<simulation::CheckPointEventType>(event);
            if (check_point_event == simulation::CheckPointEventType::CREATE_CHECKPOINT && reverted_in.contains(i) &&
                !waiting_for_revert.has_value()) {
                // This checkpoint will revert in the future: discard all events until the revert.
                waiting_for_revert = reverted_in.at(i);
                discard = true;
            } else if (check_point_event == simulation::CheckPointEventType::REVERT_CHECKPOINT &&
                       waiting_for_revert.has_value() && waiting_for_revert.value() == i) {
                // We found the revert we were waiting for: stop discarding events.
                // Note that we ensure that we find exactly the revert we were waiting for and ignore any nested
                // reverts.
                waiting_for_revert = std::nullopt;
                discard = false;
            }
        } else {
            const auto& read_write_event = std::get<simulation::NullifierTreeReadWriteEvent>(event);

            FF nullifier = read_write_event.nullifier;
            FF siloed_nullifier = read_write_event.nullifier;
            FF address = 0;

            if (read_write_event.siloing_data.has_value()) {
                siloed_nullifier = read_write_event.siloing_data->siloed_nullifier;
                address = read_write_event.siloing_data->address;
            }

            bool exists = read_write_event.low_leaf_preimage.leaf.nullifier == siloed_nullifier;
            FF nullifier_low_leaf_nullifier_diff_inv =
                exists ? 0 : (siloed_nullifier - read_write_event.low_leaf_preimage.leaf.nullifier).invert();

            bool next_nullifier_is_nonzero = false;
            FF next_nullifier_inv = 0;
            if (!exists) {
                next_nullifier_is_nonzero = read_write_event.low_leaf_preimage.nextKey != 0;
                next_nullifier_inv =
                    next_nullifier_is_nonzero ? read_write_event.low_leaf_preimage.nextKey.invert() : 0;
            }

            uint64_t updated_low_leaf_next_index = 0;
            FF updated_low_leaf_next_key = 0;
            FF updated_low_leaf_hash = 0;
            FF new_leaf_hash = 0;
            FF intermediate_root = 0;

            bool append = read_write_event.append_data.has_value();
            if (append) {
                updated_low_leaf_next_key = siloed_nullifier;
                updated_low_leaf_next_index = read_write_event.prev_snapshot.nextAvailableLeafIndex;
                updated_low_leaf_hash = read_write_event.append_data->updated_low_leaf_hash;
                new_leaf_hash = read_write_event.append_data->new_leaf_hash;
                intermediate_root = read_write_event.append_data->intermediate_root;
            }

            trace.set(
                row,
                { { { C::nullifier_check_sel, 1 },
                    { C::nullifier_check_write, read_write_event.write },
                    { C::nullifier_check_nullifier, nullifier },
                    { C::nullifier_check_root, read_write_event.prev_snapshot.root },
                    { C::nullifier_check_exists, exists },
                    { C::nullifier_check_write_root, read_write_event.next_snapshot.root },
                    { C::nullifier_check_tree_size_before_write,
                      read_write_event.prev_snapshot.nextAvailableLeafIndex },
                    { C::nullifier_check_discard, discard },
                    { C::nullifier_check_nullifier_index, read_write_event.nullifier_counter },
                    { C::nullifier_check_should_silo, read_write_event.siloing_data.has_value() },
                    { C::nullifier_check_address, address },
                    { C::nullifier_check_low_leaf_nullifier, read_write_event.low_leaf_preimage.leaf.nullifier },
                    { C::nullifier_check_low_leaf_next_index, read_write_event.low_leaf_preimage.nextIndex },
                    { C::nullifier_check_low_leaf_next_nullifier, read_write_event.low_leaf_preimage.nextKey },
                    { C::nullifier_check_updated_low_leaf_next_index, updated_low_leaf_next_index },
                    { C::nullifier_check_updated_low_leaf_next_nullifier, updated_low_leaf_next_key },
                    { C::nullifier_check_low_leaf_index, read_write_event.low_leaf_index },
                    { C::nullifier_check_siloed_nullifier, siloed_nullifier },
                    { C::nullifier_check_siloing_separator, GENERATOR_INDEX__OUTER_NULLIFIER },
                    { C::nullifier_check_should_insert, append },
                    { C::nullifier_check_low_leaf_hash, read_write_event.low_leaf_hash },
                    { C::nullifier_check_intermediate_root, intermediate_root },
                    { C::nullifier_check_updated_low_leaf_hash, updated_low_leaf_hash },
                    { C::nullifier_check_tree_height, NULLIFIER_TREE_HEIGHT },
                    { C::nullifier_check_leaf_not_exists, !exists },
                    { C::nullifier_check_nullifier_low_leaf_nullifier_diff_inv, nullifier_low_leaf_nullifier_diff_inv },
                    { C::nullifier_check_next_nullifier_is_nonzero, next_nullifier_is_nonzero },
                    { C::nullifier_check_next_nullifier_inv, next_nullifier_inv },
                    { C::nullifier_check_new_leaf_hash, new_leaf_hash },
                    { C::nullifier_check_should_write_to_public_inputs,
                      read_write_event.append_data.has_value() && !discard },
                    { C::nullifier_check_public_inputs_index,
                      AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX +
                          read_write_event.nullifier_counter } } });
            row++;
        }
    }
}

const InteractionDefinition NullifierTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_nullifier_check_silo_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_updated_low_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_nullifier_validation_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_low_leaf_next_nullifier_validation_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_new_leaf_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_new_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<lookup_nullifier_check_write_nullifier_to_public_inputs_settings,
             InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
