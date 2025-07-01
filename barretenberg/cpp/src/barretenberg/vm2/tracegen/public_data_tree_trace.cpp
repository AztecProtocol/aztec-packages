#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_public_data_check.hpp"
#include "barretenberg/vm2/generated/relations/perms_public_data_check.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using simulation::PublicDataTreeLeafPreimage;
using simulation::PublicDataTreeReadWriteEvent;

namespace {

struct EventWithDiscard {
    simulation::PublicDataTreeReadWriteEvent event;
    bool discard;
};

void process_public_data_tree_check_trace(const std::vector<EventWithDiscard>& events_with_metadata,
                                          const std::unordered_map<FF, uint32_t>& last_nondiscarded_writes,
                                          TraceContainer& trace)
{
    using C = Column;

    // This is a shifted trace, so we start at 1
    uint32_t row = 1;

    uint32_t write_idx = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX;

    for (size_t i = 0; i < events_with_metadata.size(); i++) {
        bool end = i == events_with_metadata.size() - 1;
        const auto& event = events_with_metadata[i].event;
        const bool discard = events_with_metadata[i].discard;

        bool exists = event.low_leaf_preimage.leaf.slot == event.leaf_slot;
        FF slot_low_leaf_slot_diff_inv = exists ? 0 : (event.leaf_slot - event.low_leaf_preimage.leaf.slot).invert();

        bool next_slot_is_nonzero = false;
        FF next_slot_inv = 0;
        if (!exists) {
            next_slot_is_nonzero = event.low_leaf_preimage.nextKey != 0;
            next_slot_inv = next_slot_is_nonzero ? event.low_leaf_preimage.nextKey.invert() : 0;
        }

        bool write = event.write_data.has_value();
        bool should_insert = !exists && write;
        bool nondiscarded_write = write && !discard;
        bool should_write_to_public_inputs =
            nondiscarded_write && last_nondiscarded_writes.at(event.leaf_slot) == event.execution_id;

        FF intermediate_root = 0;
        FF write_root = 0;
        PublicDataTreeLeafPreimage updated_low_leaf = PublicDataTreeLeafPreimage::empty();
        FF updated_low_leaf_hash = 0;
        FF new_leaf_hash = 0;

        if (write) {
            write_root = event.write_data->next_snapshot.root;
            intermediate_root = event.write_data->intermediate_root;
            updated_low_leaf = event.write_data->updated_low_leaf_preimage;
            updated_low_leaf_hash = event.write_data->updated_low_leaf_hash;
            new_leaf_hash = event.write_data->new_leaf_hash;
        }
        uint32_t clk = event.execution_id;
        uint32_t clk_diff = end ? 0 : events_with_metadata[i + 1].event.execution_id - clk;

        trace.set(row,
                  { {
                      { C::public_data_check_sel, 1 },
                      { C::public_data_check_not_end, !end },
                      { C::public_data_check_value, event.value },
                      { C::public_data_check_slot, event.slot },
                      { C::public_data_check_root, event.prev_snapshot.root },
                      { C::public_data_check_address, event.contract_address },
                      { C::public_data_check_write_root, write_root },
                      { C::public_data_check_tree_size_before_write, event.prev_snapshot.nextAvailableLeafIndex },
                      { C::public_data_check_write, write },
                      { C::public_data_check_clk, clk },
                      { C::public_data_check_discard, discard },
                      { C::public_data_check_low_leaf_slot, event.low_leaf_preimage.leaf.slot },
                      { C::public_data_check_low_leaf_value, event.low_leaf_preimage.leaf.value },
                      { C::public_data_check_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                      { C::public_data_check_low_leaf_next_slot, event.low_leaf_preimage.nextKey },
                      { C::public_data_check_updated_low_leaf_value, updated_low_leaf.leaf.value },
                      { C::public_data_check_updated_low_leaf_next_index, updated_low_leaf.nextIndex },
                      { C::public_data_check_updated_low_leaf_next_slot, updated_low_leaf.nextKey },
                      { C::public_data_check_low_leaf_index, event.low_leaf_index },
                      { C::public_data_check_clk_diff, clk_diff },
                      { C::public_data_check_constant_32, 32 },
                      { C::public_data_check_leaf_slot, event.leaf_slot },
                      { C::public_data_check_siloing_separator, GENERATOR_INDEX__PUBLIC_LEAF_INDEX },
                      { C::public_data_check_leaf_not_exists, !exists },
                      { C::public_data_check_leaf_slot_low_leaf_slot_diff_inv, slot_low_leaf_slot_diff_inv },
                      { C::public_data_check_next_slot_is_nonzero, next_slot_is_nonzero },
                      { C::public_data_check_next_slot_inv, next_slot_inv },
                      { C::public_data_check_low_leaf_hash, event.low_leaf_hash },
                      { C::public_data_check_intermediate_root, intermediate_root },
                      { C::public_data_check_tree_height, PUBLIC_DATA_TREE_HEIGHT },
                      { C::public_data_check_updated_low_leaf_hash, updated_low_leaf_hash },
                      { C::public_data_check_should_insert, should_insert },
                      { C::public_data_check_new_leaf_hash, new_leaf_hash },
                      { C::public_data_check_write_idx, write_idx },
                      { C::public_data_check_nondiscaded_write, nondiscarded_write },
                      { C::public_data_check_should_write_to_public_inputs, should_write_to_public_inputs },
                  } });
        row++;
        if (should_write_to_public_inputs) {
            write_idx++;
        }
    }
}

void process_squashing_trace(const std::vector<PublicDataTreeReadWriteEvent>& nondiscarded_writes,
                             TraceContainer& trace)
{
    using C = Column;

    using C = Column;

    // This is a shifted trace, so we start at 1
    uint32_t row = 1;

    for (size_t i = 0; i < nondiscarded_writes.size(); i++) {
        bool end = i == nondiscarded_writes.size() - 1;
        const auto& event = nondiscarded_writes[i];

        uint32_t clk = event.execution_id;

        bool leaf_slot_increase = false;
        bool check_clock = false;
        uint32_t clk_diff = 0;

        if (!end) {
            const auto& next_event = nondiscarded_writes[i + 1];

            if (event.leaf_slot == next_event.leaf_slot) {
                assert(event.execution_id < next_event.execution_id);
                clk_diff = next_event.execution_id - event.execution_id;
                check_clock = true;
            } else {
                assert(static_cast<uint256_t>(event.leaf_slot) < static_cast<uint256_t>(next_event.leaf_slot));
                leaf_slot_increase = true;
            }
        }

        bool should_write_to_public_inputs = leaf_slot_increase || end;

        trace.set(row,
                  { {
                      { C::public_data_squash_sel, 1 },
                      { C::public_data_squash_leaf_slot, event.leaf_slot },
                      { C::public_data_squash_clk, clk },
                      { C::public_data_squash_write_to_public_inputs, should_write_to_public_inputs },
                      { C::public_data_squash_leaf_slot_increase, leaf_slot_increase },
                      { C::public_data_squash_check_clock, check_clock },
                      { C::public_data_squash_clk_diff, clk_diff },
                      { C::public_data_squash_constant_32, 32 },
                  } });
        row++;
    }
}

} // namespace

void PublicDataTreeTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::PublicDataTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{

    std::vector<EventWithDiscard> events_with_metadata;
    std::unordered_map<FF, uint32_t> last_nondiscarded_writes;

    events_with_metadata.reserve(events.size());
    process_with_discard(events, [&](const simulation::PublicDataTreeReadWriteEvent& event, bool discard) {
        events_with_metadata.push_back({ event, discard });
        if (!discard && event.write_data.has_value()) {
            last_nondiscarded_writes[event.leaf_slot] = event.execution_id;
        }
    });

    // Sort by clk in ascending order (reads will have clk=0)
    std::sort(events_with_metadata.begin(),
              events_with_metadata.end(),
              [](const EventWithDiscard& a, const EventWithDiscard& b) {
                  return a.event.execution_id < b.event.execution_id;
              });

    process_public_data_tree_check_trace(events_with_metadata, last_nondiscarded_writes, trace);

    std::vector<PublicDataTreeReadWriteEvent> nondiscarded_writes;
    nondiscarded_writes.reserve(events_with_metadata.size());
    // Retain only nondiscarded writes
    for (const auto& event_with_metadata : events_with_metadata) {
        if (event_with_metadata.event.write_data.has_value() && !event_with_metadata.discard) {
            nondiscarded_writes.push_back(event_with_metadata.event);
        }
    }

    // Sort by slot, and then by clk
    std::sort(nondiscarded_writes.begin(),
              nondiscarded_writes.end(),
              [](const PublicDataTreeReadWriteEvent& a, const PublicDataTreeReadWriteEvent& b) {
                  if (a.leaf_slot == b.leaf_slot) {
                      return a.execution_id < b.execution_id;
                  }
                  return static_cast<uint256_t>(a.leaf_slot) < static_cast<uint256_t>(b.leaf_slot);
              });

    process_squashing_trace(nondiscarded_writes, trace);
}

const InteractionDefinition PublicDataTreeTraceBuilder::interactions =
    InteractionDefinition()
        // Public data read/write
        .add<lookup_public_data_check_silo_poseidon2_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_slot_validation_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_next_slot_validation_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_poseidon2_0_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_poseidon2_1_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_updated_low_leaf_poseidon2_0_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_updated_low_leaf_poseidon2_1_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_new_leaf_poseidon2_0_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_new_leaf_poseidon2_1_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_new_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<perm_public_data_check_squashing_settings, InteractionType::Permutation>()
        .add<lookup_public_data_check_write_public_data_to_public_inputs_settings,
             InteractionType::LookupIntoIndexedByClk>();

//       Disabled sorting lookups
//      .add<lookup_public_data_squash_leaf_slot_increase_ff_gt_settings, InteractionType::LookupGeneric>()
//      .add<lookup_public_data_squash_clk_diff_range_settings, InteractionType::LookupSequential>()
//      .add<lookup_public_data_check_clk_diff_range_settings, InteractionType::LookupGeneric>()

} // namespace bb::avm2::tracegen
